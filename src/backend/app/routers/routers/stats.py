from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case, or_
from app import models
from app.metrics import provider_metrics
from app.routers.admin.dependencies import get_db, get_db_pool, require_admin
from app.utils.performance import monitor_session_queries, log_performance_summary
from datetime import datetime, timedelta
import logging
from app.services.services.quota_service import QuotaService

router = APIRouter(prefix="/api/admin", tags=["admin-stats"])

@router.get("/stats")
def stats(request: Request, db: Session = Depends(get_db), db_pool: Session = Depends(get_db_pool)):
    """[DEPRECATED] 统计接口（请迁移至 /stats/overview）。本路由保留向后兼容，将在后续版本移除。"""
    logging.getLogger(__name__).warning("/api/admin/stats is deprecated; please use /stats/overview")
    with monitor_session_queries(db, "admin_stats"):
        # Protect admin stats
        require_admin(request, db)

        # 基础统计
        total_codes = db.query(models.RedeemCode).count()
        used_codes = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()

        # 邀请统计
        total_invites = db.query(models.InviteRequest).count()
        pending_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()
        successful_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.sent).count()
        failed_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.failed).count()

        # 母账号和团队统计
        total_mothers = db.query(models.MotherAccount).count()
        active_mothers = db.query(models.MotherAccount).filter(models.MotherAccount.status == models.MotherStatus.active).count()
        total_teams = db.query(models.MotherTeam).count()
        active_teams = db.query(models.MotherTeam).filter(models.MotherTeam.is_enabled == True).count()

        # 席位使用统计
        total_seats = db.query(models.SeatAllocation).count()
        used_seats = db.query(models.SeatAllocation).filter(
            models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used])
        ).count()

        # 计算使用率
        usage_rate = round((used_seats / total_seats * 100) if total_seats > 0 else 0, 1)
        code_usage_rate = round((used_codes / total_codes * 100) if total_codes > 0 else 0, 1)

        # 代码配额口径统一：可兑换额度 = 空位（活跃母号且free）- 未过期未使用兑换码
        enabled_teams = db.query(models.MotherTeam).filter(models.MotherTeam.is_enabled == True).count()  # noqa: E712
        snapshot = QuotaService.get_quota_snapshot(db, db_pool).to_dict()
        capacity = snapshot["max_code_capacity"]
        active_codes = snapshot["active_codes"]
        remaining_quota = snapshot["remaining_quota"]

        # 最近7天的活动统计 - 优化N+1查询
        recent_activity = []
        dates = []
        date_ranges = []

        # 构建7天的日期范围
        for i in range(7):
            date = datetime.utcnow().date() - timedelta(days=i)
            start_time = datetime.combine(date, datetime.min.time())
            end_time = datetime.combine(date, datetime.max.time())
            dates.append(date)
            date_ranges.append((start_time, end_time))

        if date_ranges:
            # 一次性查询所有日期范围的邀请统计
            invite_conditions = []
            redemption_conditions = []

            for start_time, end_time in date_ranges:
                invite_conditions.append(
                    and_(
                        models.InviteRequest.created_at >= start_time,
                        models.InviteRequest.created_at <= end_time
                    )
                )
                redemption_conditions.append(
                    and_(
                        models.RedeemCode.status == models.CodeStatus.used,
                        models.RedeemCode.used_at >= start_time,
                        models.RedeemCode.used_at <= end_time
                    )
                )

            # 针对 SQLite 缺少 date_trunc 的兼容处理
            dialect = db.bind.dialect.name if db.bind else ""

            def trunc_day(column):
                if dialect == "sqlite":
                    return func.strftime('%Y-%m-%d', column)
                return func.date_trunc('day', column)

            truncate_invite = trunc_day(models.InviteRequest.created_at)
            truncate_redeem = trunc_day(models.RedeemCode.used_at)

            daily_stats = db.query(
                truncate_invite.label('date'),
                func.count(models.InviteRequest.id).label('invites')
            ).filter(
                or_(*invite_conditions)
            ).group_by(
                truncate_invite
            ).all() if invite_conditions else []

            redemption_stats = db.query(
                truncate_redeem.label('date'),
                func.count(models.RedeemCode.id).label('redemptions')
            ).filter(
                and_(
                    models.RedeemCode.status == models.CodeStatus.used,
                    or_(*redemption_conditions)
                )
            ).group_by(
                truncate_redeem
            ).all() if redemption_conditions else []

            # 构建映射表
            def _normalize_date(value):
                if isinstance(value, datetime):
                    return value.date()
                if isinstance(value, str):
                    return datetime.strptime(value, '%Y-%m-%d').date()
                return value

            invites_map = {_normalize_date(stat.date): stat.invites for stat in daily_stats}
            redemptions_map = {_normalize_date(stat.date): stat.redemptions for stat in redemption_stats}

            # 组装结果
            for i, date in enumerate(dates):
                daily_invites = invites_map.get(date, 0)
                daily_redemptions = redemptions_map.get(date, 0)
                recent_activity.append({
                    "date": date.strftime("%m-%d"),
                    "invites": daily_invites,
                    "redemptions": daily_redemptions
                })

        # 按状态分组的邀请统计
        invite_status_stats = db.query(
            models.InviteRequest.status,
            func.count(models.InviteRequest.id).label('count')
        ).group_by(models.InviteRequest.status).all()

        status_breakdown = {}
        for status, count in invite_status_stats:
            status_breakdown[status.value] = count

        # 母账号使用情况详细统计 - 优化N+1查询
        mother_usage = []
        mothers = db.query(models.MotherAccount).all()

        if mothers:
            mother_ids = [m.id for m in mothers]
            # 一次性查询所有母账号的座位使用情况
            seat_usage_stats = db.query(
                models.SeatAllocation.mother_id,
                func.count(models.SeatAllocation.id).label('used_count')
            ).filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used])
            ).group_by(models.SeatAllocation.mother_id).all()

            # 构建使用情况映射表
            usage_map = {stat.mother_id: stat.used_count for stat in seat_usage_stats}

            for mother in mothers:
                used = usage_map.get(mother.id, 0)
                mother_usage.append({
                    "id": mother.id,
                    "name": mother.name,
                    "seat_limit": mother.seat_limit,
                    "seats_used": used,
                    "usage_rate": round((used / mother.seat_limit * 100) if mother.seat_limit > 0 else 0, 1),
                    "status": mother.status.value
                })

        # 兑换码批次统计
        batch_stats = db.query(
            models.RedeemCode.batch_id,
            func.count(models.RedeemCode.id).label('total'),
            func.sum(
                case(
                    (models.RedeemCode.status == models.CodeStatus.used, 1),
                    else_=0,
                )
            ).label('used')
        ).group_by(models.RedeemCode.batch_id).all()

        batch_breakdown = []
        for batch_id, total, used in batch_stats:
            if batch_id:  # 只包含有批次ID的
                batch_breakdown.append({
                    "batch_id": batch_id,
                    "total_codes": total,
                    "used_codes": used or 0,
                    "usage_rate": round(((used or 0) / total * 100) if total > 0 else 0, 1)
                })

        # 记录性能摘要
        log_performance_summary()

        return {
            # 基础统计
            "total_codes": total_codes,
            "used_codes": used_codes,
            "code_usage_rate": code_usage_rate,

            # 用户和邀请统计
            "total_users": total_invites,
            "pending_invites": pending_invites,
            "successful_invites": successful_invites,
            "failed_invites": failed_invites,

            # 母账号和团队统计
            "total_mothers": total_mothers,
            "active_mothers": active_mothers,
            "total_teams": total_teams,
            "active_teams": active_teams,

            # 席位统计
            "total_seats": total_seats,
            "used_seats": used_seats,
            "usage_rate": usage_rate,

            # 详细统计
            "recent_activity": recent_activity,
            "status_breakdown": status_breakdown,
            "mother_usage": mother_usage,
            "batch_breakdown": batch_breakdown,

            # 系统指标
            "provider_metrics": provider_metrics.snapshot() if hasattr(provider_metrics, 'snapshot') else {},

            # 生成码配额
            "enabled_teams": enabled_teams,
            "max_code_capacity": capacity,
            "active_codes": active_codes,
            "remaining_code_quota": remaining_quota,
        }

@router.get("/stats/dashboard")
def dashboard_stats(request: Request, db: Session = Depends(get_db)):
    """获取仪表板概览统计数据"""
    require_admin(request, db)
    
    # 今日统计
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    today_invites = db.query(models.InviteRequest).filter(
        and_(
            models.InviteRequest.created_at >= today_start,
            models.InviteRequest.created_at <= today_end
        )
    ).count()
    
    today_redemptions = db.query(models.RedeemCode).filter(
        and_(
            models.RedeemCode.status == models.CodeStatus.used,
            models.RedeemCode.used_at >= today_start,
            models.RedeemCode.used_at <= today_end
        )
    ).count()
    
    # 本周统计
    week_start = today - timedelta(days=today.weekday())
    week_start_dt = datetime.combine(week_start, datetime.min.time())
    
    week_invites = db.query(models.InviteRequest).filter(
        models.InviteRequest.created_at >= week_start_dt
    ).count()
    
    week_redemptions = db.query(models.RedeemCode).filter(
        and_(
            models.RedeemCode.status == models.CodeStatus.used,
            models.RedeemCode.used_at >= week_start_dt
        )
    ).count()
    
    # 系统健康状态（不返回即将过期计数）
    failed_invites_today = db.query(models.InviteRequest).filter(
        and_(
            models.InviteRequest.status == models.InviteStatus.failed,
            models.InviteRequest.created_at >= today_start,
            models.InviteRequest.created_at <= today_end
        )
    ).count()

    return {
        "today": {
            "invites": today_invites,
            "redemptions": today_redemptions,
            "failed_invites": failed_invites_today
        },
        "week": {
            "invites": week_invites,
            "redemptions": week_redemptions
        },
        # 不返回 expiring_codes，避免对用户进行强调
        "alerts": {
            "failed_invites_today": failed_invites_today
        }
    }

@router.get("/stats/trends")
def trends_stats(request: Request, db: Session = Depends(get_db), days: int = 30):
    """获取趋势统计数据"""
    require_admin(request, db)
    
    # 限制查询天数
    days = min(days, 90)
    
    trends = []
    for i in range(days):
        date = datetime.utcnow().date() - timedelta(days=i)
        start_time = datetime.combine(date, datetime.min.time())
        end_time = datetime.combine(date, datetime.max.time())
        
        # 当天统计
        daily_invites = db.query(models.InviteRequest).filter(
            and_(
                models.InviteRequest.created_at >= start_time,
                models.InviteRequest.created_at <= end_time
            )
        ).count()
        
        daily_redemptions = db.query(models.RedeemCode).filter(
            and_(
                models.RedeemCode.status == models.CodeStatus.used,
                models.RedeemCode.used_at >= start_time,
                models.RedeemCode.used_at <= end_time
            )
        ).count()
        
        daily_successful = db.query(models.InviteRequest).filter(
            and_(
                models.InviteRequest.status == models.InviteStatus.sent,
                models.InviteRequest.updated_at >= start_time,
                models.InviteRequest.updated_at <= end_time
            )
        ).count()
        
        daily_failed = db.query(models.InviteRequest).filter(
            and_(
                models.InviteRequest.status == models.InviteStatus.failed,
                models.InviteRequest.updated_at >= start_time,
                models.InviteRequest.updated_at <= end_time
            )
        ).count()
        
        trends.append({
            "date": date.isoformat(),
            "invites": daily_invites,
            "redemptions": daily_redemptions,
            "successful": daily_successful,
            "failed": daily_failed
        })
    
    return {"trends": list(reversed(trends))}
