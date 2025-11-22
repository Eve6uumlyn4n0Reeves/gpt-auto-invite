"""
统一的双域统计查询API。

提供跨Users库和Pool库的综合统计信息，支持业务分析和监控。
主要特点：
1. 双库数据聚合：同时查询Users和Pool域的数据
2. 实时计算：提供最新的业务指标
3. 灵活过滤：支持按时间、状态等维度过滤
4. 缓存优化：可配置缓存策略提高性能
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case

from app.database import get_db_users, get_db_pool
from app.services.services import get_mother_query_service
from app.services.services.mother_query import MotherQueryService
from app.services.services.quota_service import QuotaService
from app.repositories.users_repository import UsersRepository
from app.routers.admin.dependencies import require_admin

logger = logging.getLogger(__name__)
from app.metrics import provider_metrics

router = APIRouter()


class UnifiedStatsService:
    """统一统计服务，负责跨域数据聚合"""

    def __init__(
        self,
        users_db: Session,
        pool_db: Session,
        mother_query: MotherQueryService,
    ):
        self.users_db = users_db
        self.pool_db = pool_db
        self.mother_query = mother_query
        self.users_repo = UsersRepository(users_db)
        # 聚合侧仅通过 MotherQueryService 获取 Pool 域指标，避免直接使用 PoolRepository 做列表/统计/拼装

    def get_overview_stats(self) -> Dict[str, Any]:
        """
        获取总览统计信息（DashboardStats 兼容结构）。

        为保持前端兼容性，直接返回扁平化的 DashboardStats 字段集合，
        同时统一使用 QuotaService 口径输出配额相关指标。
        """
        from app import models

        # 统一配额口径（跨库）
        snapshot = QuotaService.get_quota_snapshot(self.users_db, self.pool_db).to_dict()
        total_codes = snapshot["total_codes"]
        used_codes = snapshot["used_codes"]
        code_usage_rate = round((used_codes / total_codes * 100) if total_codes > 0 else 0, 1)

        # —— Users 域：邀请统计 ——
        total_invites = self.users_db.query(models.InviteRequest).count()
        pending_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.pending
        ).count()
        successful_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.sent
        ).count()
        failed_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.failed
        ).count()
        accepted_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.accepted
        ).count()

        top_level_success_rate = round(accepted_invites / total_invites * 100, 2) if total_invites > 0 else 0

        # —— Pool 域：母号/团队/席位统计 ——
        total_mothers = self.pool_db.query(models.MotherAccount).count()
        active_mothers = self.pool_db.query(models.MotherAccount).filter(
            models.MotherAccount.status == models.MotherStatus.active
        ).count()
        total_teams = self.pool_db.query(models.MotherTeam).count()
        active_teams = self.pool_db.query(models.MotherTeam).filter(models.MotherTeam.is_enabled == True).count()  # noqa: E712

        total_seats = self.pool_db.query(models.SeatAllocation).count()
        used_seats = snapshot["used_seats"]
        usage_rate = round((used_seats / total_seats * 100) if total_seats > 0 else 0, 1)

        # —— 最近7天活动（Users库：邀请/兑换） ——
        recent_activity: list[dict[str, Any]] = []
        dates: list[datetime.date] = []
        date_ranges: list[tuple[datetime, datetime]] = []
        for i in range(7):
            d = datetime.utcnow().date() - timedelta(days=i)
            start_time = datetime.combine(d, datetime.min.time())
            end_time = datetime.combine(d, datetime.max.time())
            dates.append(d)
            date_ranges.append((start_time, end_time))

        if date_ranges:
            # SQLite 兼容的天粒度截断
            dialect = self.users_db.bind.dialect.name if self.users_db.bind else ""

            def trunc_day(column):
                if dialect == "sqlite":
                    return func.strftime('%Y-%m-%d', column)
                return func.date_trunc('day', column)

            truncate_invite = trunc_day(models.InviteRequest.created_at)
            truncate_redeem = trunc_day(models.RedeemCode.used_at)

            invite_conditions = [
                and_(
                    models.InviteRequest.created_at >= start,
                    models.InviteRequest.created_at <= end,
                )
                for start, end in date_ranges
            ]
            redemption_conditions = [
                and_(
                    models.RedeemCode.status == models.CodeStatus.used,
                    models.RedeemCode.used_at >= start,
                    models.RedeemCode.used_at <= end,
                )
                for start, end in date_ranges
            ]

            daily_stats = self.users_db.query(
                truncate_invite.label('date'),
                func.count(models.InviteRequest.id).label('invites'),
            ).filter(
                or_(*invite_conditions)
            ).group_by(
                truncate_invite
            ).all() if invite_conditions else []

            redemption_stats = self.users_db.query(
                truncate_redeem.label('date'),
                func.count(models.RedeemCode.id).label('redemptions'),
            ).filter(
                and_(
                    models.RedeemCode.status == models.CodeStatus.used,
                    or_(*redemption_conditions),
                )
            ).group_by(
                truncate_redeem
            ).all() if redemption_conditions else []

            def _normalize_date(value):
                if isinstance(value, datetime):
                    return value.date()
                if isinstance(value, str):
                    return datetime.strptime(value, '%Y-%m-%d').date()
                return value

            invites_map = {_normalize_date(stat.date): stat.invites for stat in daily_stats}
            redemptions_map = {_normalize_date(stat.date): stat.redemptions for stat in redemption_stats}

            for d in dates:
                daily_invites = invites_map.get(d, 0)
                daily_redemptions = redemptions_map.get(d, 0)
                recent_activity.append({
                    "date": d.strftime("%m-%d"),
                    "invites": daily_invites,
                    "redemptions": daily_redemptions,
                })

        # —— 邀请状态分布（Users库） ——
        invite_status_stats = self.users_db.query(
            models.InviteRequest.status,
            func.count(models.InviteRequest.id).label('count'),
        ).group_by(models.InviteRequest.status).all()
        status_breakdown = {status.value: count for status, count in invite_status_stats}

        # —— 母号使用情况（Pool库） ——
        mother_usage: list[dict[str, Any]] = []
        mothers = self.pool_db.query(models.MotherAccount).all()
        if mothers:
            mother_ids = [m.id for m in mothers]
            seat_usage_stats = self.pool_db.query(
                models.SeatAllocation.mother_id,
                func.count(models.SeatAllocation.id).label('used_count'),
            ).filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
            ).group_by(models.SeatAllocation.mother_id).all()
            usage_map = {stat.mother_id: stat.used_count for stat in seat_usage_stats}
            for mother in mothers:
                used = int(usage_map.get(mother.id, 0) or 0)
                mother_usage.append({
                    "id": mother.id,
                    "name": mother.name,
                    "seat_limit": mother.seat_limit,
                    "seats_used": used,
                    "usage_rate": round((used / mother.seat_limit * 100) if mother.seat_limit > 0 else 0, 1),
                    "status": mother.status.value,
                })

        # —— 兑换码批次统计（Users库） ——
        batch_stats = self.users_db.query(
            models.RedeemCode.batch_id,
            func.count(models.RedeemCode.id).label('total'),
            func.sum(
                case((models.RedeemCode.status == models.CodeStatus.used, 1), else_=0)
            ).label('used'),
        ).group_by(models.RedeemCode.batch_id).all()
        batch_breakdown = []
        for batch_id, total, used in batch_stats:
            if batch_id:
                used_val = int(used or 0)
                batch_breakdown.append({
                    "batch_id": batch_id,
                    "total_codes": int(total or 0),
                    "used_codes": used_val,
                    "usage_rate": round(((used_val) / (total or 1) * 100) if (total or 0) > 0 else 0, 1),
                })

        # —— 汇总（DashboardStats 形状） ——
        result: Dict[str, Any] = {
            # 基础统计
            "total_codes": total_codes,
            "used_codes": used_codes,
            "code_usage_rate": code_usage_rate,

            # 用户与邀请
            "total_users": total_invites,
            "pending_invites": pending_invites,
            "successful_invites": successful_invites,
            "failed_invites": failed_invites,

            # 母号与团队
            "total_mothers": total_mothers,
            "active_mothers": active_mothers,
            "total_teams": total_teams,
            "active_teams": active_teams,

            # 席位
            "total_seats": total_seats,
            "used_seats": used_seats,
            "usage_rate": usage_rate,

            # 详细
            "recent_activity": recent_activity,
            "status_breakdown": status_breakdown,
            "mother_usage": mother_usage,
            "batch_breakdown": batch_breakdown,

            # 生成码配额（统一口径）
            "enabled_teams": active_teams,  # 与 legacy 含义一致：启用团队数
            "max_code_capacity": snapshot["max_code_capacity"],
            "active_codes": snapshot["active_codes"],
            "remaining_code_quota": snapshot["remaining_quota"],

            # 便于前端直接展示
            "success_rate": top_level_success_rate,
        }

        # 可选：Provider 指标（前端可忽略）
        if hasattr(provider_metrics, 'snapshot'):
            try:
                result["provider_metrics"] = provider_metrics.snapshot()
            except Exception:
                # 指标不可用不影响整体
                pass

        return result

    def get_usage_trends(
        self,
        days: int = 7,
        metric: str = 'invites'
    ) -> List[Dict[str, Any]]:
        """
        获取使用趋势数据

        Args:
            days: 统计天数
            metric: 统计指标类型（invites, codes, jobs, mothers）
        """
        trends = []
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days - 1)

        for i in range(days):
            current_date = start_date + timedelta(days=i)
            day_start = datetime.combine(current_date, datetime.min.time())
            day_end = datetime.combine(current_date, datetime.max.time())

            if metric == 'invites':
                count = self._count_invites_in_range(day_start, day_end)
            elif metric == 'codes':
                count = self._count_codes_in_range(day_start, day_end)
            elif metric == 'jobs':
                count = self._count_jobs_in_range(day_start, day_end)
            elif metric == 'mothers':
                count = self._count_mothers_in_range(day_start, day_end)
            else:
                count = 0

            trends.append({
                'date': current_date.isoformat(),
                'count': count,
            })

        return trends

    def _count_invites_in_range(self, start: datetime, end: datetime) -> int:
        """统计指定时间范围内的邀请数量"""
        from app import models
        return self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.created_at >= start,
            models.InviteRequest.created_at <= end
        ).count()

    def _count_codes_in_range(self, start: datetime, end: datetime) -> int:
        """统计指定时间范围内的兑换码使用数量"""
        from app import models
        return self.users_db.query(models.RedeemCode).filter(
            models.RedeemCode.used_at >= start,
            models.RedeemCode.used_at <= end
        ).count()

    def _count_jobs_in_range(self, start: datetime, end: datetime) -> int:
        """统计指定时间范围内的批处理作业数量"""
        from app import models
        return self.users_db.query(models.BatchJob).filter(
            models.BatchJob.created_at >= start,
            models.BatchJob.created_at <= end
        ).count()

    def _count_mothers_in_range(self, start: datetime, end: datetime) -> int:
        """统计指定时间范围内创建的Mother账号数量"""
        from app import models
        return self.pool_db.query(models.MotherAccount).filter(
            models.MotherAccount.created_at >= start,
            models.MotherAccount.created_at <= end
        ).count()

    def get_health_status(self) -> Dict[str, Any]:
        """
        获取系统健康状态

        检查两个数据库的连接状态和关键指标
        """
        health = {
            'overall_status': 'healthy',
            'database_connections': {},
            'critical_metrics': {},
            'alerts': [],
        }

        # 检查数据库连接
        try:
            self.users_db.execute('SELECT 1').scalar()
            health['database_connections']['users_db'] = 'connected'
        except Exception as e:
            health['database_connections']['users_db'] = f'error: {str(e)}'
            health['overall_status'] = 'unhealthy'
            health['alerts'].append('Users数据库连接失败')

        try:
            self.pool_db.execute('SELECT 1').scalar()
            health['database_connections']['pool_db'] = 'connected'
        except Exception as e:
            health['database_connections']['pool_db'] = f'error: {str(e)}'
            health['overall_status'] = 'unhealthy'
            health['alerts'].append('Pool数据库连接失败')

        # 检查关键指标
        try:
            # 无效Mother账号比例
            from app import models
            total_mothers = self.pool_db.query(models.MotherAccount).count()
            invalid_mothers = self.pool_db.query(models.MotherAccount).filter(
                models.MotherAccount.status == models.MotherStatus.invalid
            ).count()

            if total_mothers > 0:
                invalid_rate = invalid_mothers / total_mothers * 100
                health['critical_metrics']['invalid_mother_rate'] = round(invalid_rate, 2)
                if invalid_rate > 20:  # 超过20%的Mother账号无效
                    health['alerts'].append(f'无效Mother账号比例过高: {invalid_rate:.1f}%')
                    health['overall_status'] = 'warning'

            # 失败批处理作业比例
            total_jobs = self.users_db.query(models.BatchJob).count()
            failed_jobs = self.users_db.query(models.BatchJob).filter(
                models.BatchJob.status == 'failed'
            ).count()

            if total_jobs > 0:
                failure_rate = failed_jobs / total_jobs * 100
                health['critical_metrics']['job_failure_rate'] = round(failure_rate, 2)
                if failure_rate > 10:  # 超过10%的作业失败
                    health['alerts'].append(f'批处理作业失败率过高: {failure_rate:.1f}%')
                    health['overall_status'] = 'warning'

        except Exception as e:
            health['alerts'].append(f'获取关键指标失败: {str(e)}')
            health['overall_status'] = 'unhealthy'

        health['checked_at'] = datetime.utcnow().isoformat()
        return health


def get_unified_stats_service(
    mother_query: MotherQueryService = Depends(get_mother_query_service),
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
) -> UnifiedStatsService:
    """获取统一统计服务实例"""
    return UnifiedStatsService(users_db, pool_db, mother_query)


# ==================== API路由 ====================

@router.get("/stats/overview")
def get_overview_stats(
    request: Request,
):
    """
    获取系统总览统计信息

    包含Pool域和Users域的所有核心指标
    """
    # 手动管理依赖，避免框架对复杂注入产生不兼容解析
    from app.database import SessionUsers, SessionPool
    from app.repositories.mother_repository import MotherRepository
    from app.services.services.mother_query import MotherQueryService

    db_users = SessionUsers()
    db_pool = SessionPool()
    try:
        require_admin(request, db_users)
        mother_repo = MotherRepository(db_pool)
        mother_query = MotherQueryService(db_pool, mother_repo)
        unified_stats = UnifiedStatsService(db_users, db_pool, mother_query)
        return unified_stats.get_overview_stats()
    finally:
        try:
            db_users.close()
        except Exception as e:
            logger.error(f"关闭 Users Session 失败: {e}", exc_info=True)
        try:
            db_pool.close()
        except Exception as e:
            logger.error(f"关闭 Pool Session 失败: {e}", exc_info=True)


@router.get("/stats/trends")
def get_usage_trends(
    request: Request,
    days: int = Query(7, ge=1, le=90, description="统计天数"),
    metric: str = Query("invites", description="统计指标: invites, codes, jobs, mothers"),
):
    """
    获取使用趋势数据

    支持多种指标的时间序列分析
    """
    from app.database import SessionUsers, SessionPool
    from app.repositories.mother_repository import MotherRepository
    from app.services.services.mother_query import MotherQueryService

    db_users = SessionUsers()
    db_pool = SessionPool()
    try:
        require_admin(request, db_users)
        mother_repo = MotherRepository(db_pool)
        mother_query = MotherQueryService(db_pool, mother_repo)
        unified_stats = UnifiedStatsService(db_users, db_pool, mother_query)

        if metric not in ['invites', 'codes', 'jobs', 'mothers']:
            raise ValueError(f"不支持的统计指标: {metric}")

        return {
            'metric': metric,
            'days': days,
            'data': unified_stats.get_usage_trends(days, metric),
        }
    finally:
        try:
            db_users.close()
        except Exception as e:
            logger.error(f"关闭 Users Session 失败: {e}", exc_info=True)
        try:
            db_pool.close()
        except Exception as e:
            logger.error(f"关闭 Pool Session 失败: {e}", exc_info=True)


@router.get("/stats/health")
def get_health_status(
    request: Request,
):
    """
    获取系统健康状态

    检查数据库连接和关键业务指标
    """
    from app.database import SessionUsers, SessionPool
    from app.repositories.mother_repository import MotherRepository
    from app.services.services.mother_query import MotherQueryService

    db_users = SessionUsers()
    db_pool = SessionPool()
    try:
        require_admin(request, db_users)
        mother_repo = MotherRepository(db_pool)
        mother_query = MotherQueryService(db_pool, mother_repo)
        unified_stats = UnifiedStatsService(db_users, db_pool, mother_query)
        return unified_stats.get_health_status()
    finally:
        try:
            db_users.close()
        except Exception as e:
            logger.error(f"关闭 Users Session 失败: {e}", exc_info=True)
        try:
            db_pool.close()
        except Exception as e:
            logger.error(f"关闭 Pool Session 失败: {e}", exc_info=True)


@router.get("/stats/pool-domain")
def get_pool_domain_stats(
    request: Request,
):
    """
    获取Pool域详细统计信息

    仅包含Pool域（Mother、Team、Seat、ChildAccount等）的统计
    """
    from app.database import SessionUsers, SessionPool
    from app.repositories.mother_repository import MotherRepository
    from app.services.services.mother_query import MotherQueryService

    db_users = SessionUsers()
    db_pool = SessionPool()
    try:
        require_admin(request, db_users)
        mother_repo = MotherRepository(db_pool)
        mother_query = MotherQueryService(db_pool, mother_repo)
        return mother_query.get_quota_metrics()
    finally:
        try:
            db_users.close()
        except Exception:
            pass
        try:
            db_pool.close()
        except Exception:
            pass


@router.get("/stats/users-domain")
def get_users_domain_stats(
    request: Request,
):
    """
    获取Users域详细统计信息

    仅包含Users域（Invite、RedeemCode、BatchJob等）的统计
    """
    from app.database import SessionUsers

    db_users = SessionUsers()
    try:
        require_admin(request, db_users)

        # 邀请统计
        invite_stats = _get_invite_stats(db_users)

        # 兑换码统计
        code_stats = _get_code_stats(db_users)

        # 批处理作业统计
        job_stats = _get_job_stats(db_users)

        # 审计日志统计
        audit_stats = _get_audit_stats(db_users)

        return {
            'invites': invite_stats,
            'redeem_codes': code_stats,
            'batch_jobs': job_stats,
            'audit_logs': audit_stats,
            'last_updated': datetime.utcnow().isoformat(),
        }
    finally:
        try:
            db_users.close()
        except Exception:
            pass


def _get_invite_stats(db: Session) -> Dict[str, Any]:
    """获取邀请统计"""
    from app import models

    total = db.query(models.InviteRequest).count()
    pending = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()
    sent = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.sent).count()
    accepted = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.accepted).count()
    failed = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.failed).count()

    return {
        'total': total,
        'pending': pending,
        'sent': sent,
        'accepted': accepted,
        'failed': failed,
        'success_rate': round(accepted / total * 100, 2) if total > 0 else 0,
    }


def _get_code_stats(db: Session) -> Dict[str, Any]:
    """获取兑换码统计"""
    from app import models

    total = db.query(models.RedeemCode).count()
    unused = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.unused).count()
    used = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()
    expired = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.expired).count()
    blocked = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.blocked).count()

    return {
        'total': total,
        'unused': unused,
        'used': used,
        'expired': expired,
        'blocked': blocked,
        'usage_rate': round(used / total * 100, 2) if total > 0 else 0,
    }


def _get_job_stats(db: Session) -> Dict[str, Any]:
    """获取批处理作业统计"""
    from app import models

    total = db.query(models.BatchJob).count()
    pending = db.query(models.BatchJob).filter(models.BatchJob.status == 'pending').count()
    running = db.query(models.BatchJob).filter(models.BatchJob.status == 'running').count()
    succeeded = db.query(models.BatchJob).filter(models.BatchJob.status == 'succeeded').count()
    failed = db.query(models.BatchJob).filter(models.BatchJob.status == 'failed').count()

    return {
        'total': total,
        'pending': pending,
        'running': running,
        'succeeded': succeeded,
        'failed': failed,
        'success_rate': round(succeeded / total * 100, 2) if total > 0 else 0,
    }


def _get_audit_stats(db: Session) -> Dict[str, Any]:
    """获取审计日志统计"""
    from app import models

    total = db.query(models.AuditLog).count()

    # 最近24小时
    one_day_ago = datetime.utcnow() - timedelta(days=1)
    recent_24h = db.query(models.AuditLog).filter(models.AuditLog.created_at >= one_day_ago).count()

    # 最近7天
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_7d = db.query(models.AuditLog).filter(models.AuditLog.created_at >= seven_days_ago).count()

    return {
        'total': total,
        'recent_24h': recent_24h,
        'recent_7d': recent_7d,
    }
