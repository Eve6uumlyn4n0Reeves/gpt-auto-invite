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

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db_users, get_db_pool
from app.services.services import MotherQueryServiceDep
from app.services.services.invites import InviteService
from app.services.services.redeem import RedeemService
from app.repositories.users_repository import UsersRepository
from app.repositories.pool_repository import PoolRepository
from app.routers.admin.dependencies import require_admin

router = APIRouter()


class UnifiedStatsService:
    """统一统计服务，负责跨域数据聚合"""

    def __init__(
        self,
        users_db: Session,
        pool_db: Session,
        mother_query: MotherQueryServiceDep,
    ):
        self.users_db = users_db
        self.pool_db = pool_db
        self.mother_query = mother_query
        self.users_repo = UsersRepository(users_db)
        self.pool_repo = PoolRepository(pool_db)

    def get_overview_stats(self) -> Dict[str, Any]:
        """
        获取总览统计信息

        包含两个域的核心指标：
        - Pool域：Mother账号、席位、子号统计
        - Users域：邀请、兑换码、批处理统计
        """
        from app import models

        # Pool域统计
        pool_stats = self.mother_query.get_quota_metrics()

        # Users域统计
        users_stats = {}

        # 邀请统计
        total_invites = self.users_db.query(models.InviteRequest).count()
        pending_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.pending
        ).count()
        sent_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.sent
        ).count()
        accepted_invites = self.users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.accepted
        ).count()

        users_stats['invites'] = {
            'total': total_invites,
            'pending': pending_invites,
            'sent': sent_invites,
            'accepted': accepted_invites,
            'success_rate': round(accepted_invites / total_invites * 100, 2) if total_invites > 0 else 0,
        }

        # 兑换码统计
        total_codes = self.users_db.query(models.RedeemCode).count()
        unused_codes = self.users_db.query(models.RedeemCode).filter(
            models.RedeemCode.status == models.CodeStatus.unused
        ).count()
        used_codes = self.users_db.query(models.RedeemCode).filter(
            models.RedeemCode.status == models.CodeStatus.used
        ).count()

        users_stats['redeem_codes'] = {
            'total': total_codes,
            'unused': unused_codes,
            'used': used_codes,
            'usage_rate': round(used_codes / total_codes * 100, 2) if total_codes > 0 else 0,
        }

        # 批处理作业统计
        total_jobs = self.users_db.query(models.BatchJob).count()
        pending_jobs = self.users_db.query(models.BatchJob).filter(
            models.BatchJob.status == 'pending'
        ).count()
        running_jobs = self.users_db.query(models.BatchJob).filter(
            models.BatchJob.status == 'running'
        ).count()
        succeeded_jobs = self.users_db.query(models.BatchJob).filter(
            models.BatchJob.status == 'succeeded'
        ).count()
        failed_jobs = self.users_db.query(models.BatchJob).filter(
            models.BatchJob.status == 'failed'
        ).count()

        users_stats['batch_jobs'] = {
            'total': total_jobs,
            'pending': pending_jobs,
            'running': running_jobs,
            'succeeded': succeeded_jobs,
            'failed': failed_jobs,
            'success_rate': round(succeeded_jobs / total_jobs * 100, 2) if total_jobs > 0 else 0,
        }

        # 审计日志统计（最近7天）
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_audits = self.users_db.query(models.AuditLog).filter(
            models.AuditLog.created_at >= seven_days_ago
        ).count()

        users_stats['audit_logs'] = {
            'recent_7_days': recent_audits,
        }

        # 管理员会话统计
        active_sessions = self.users_db.query(models.AdminSession).filter(
            models.AdminSession.revoked == False,
            models.AdminSession.expires_at > datetime.utcnow()
        ).count()

        users_stats['admin_sessions'] = {
            'active': active_sessions,
        }

        return {
            'pool_domain': pool_stats,
            'users_domain': users_stats,
            'last_updated': datetime.utcnow().isoformat(),
        }

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
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
    mother_query: MotherQueryServiceDep,
) -> UnifiedStatsService:
    """获取统一统计服务实例"""
    return UnifiedStatsService(users_db, pool_db, mother_query)


# ==================== API路由 ====================

@router.get("/stats/overview")
def get_overview_stats(
    request: Request,
    unified_stats: UnifiedStatsService = Depends(get_unified_stats_service),
    users_db: Session = Depends(get_db_users),
):
    """
    获取系统总览统计信息

    包含Pool域和Users域的所有核心指标
    """
    require_admin(request, users_db)
    return unified_stats.get_overview_stats()


@router.get("/stats/trends")
def get_usage_trends(
    request: Request,
    unified_stats: UnifiedStatsService = Depends(get_unified_stats_service),
    users_db: Session = Depends(get_db_users),
    days: int = Query(7, ge=1, le=90, description="统计天数"),
    metric: str = Query("invites", description="统计指标: invites, codes, jobs, mothers"),
):
    """
    获取使用趋势数据

    支持多种指标的时间序列分析
    """
    require_admin(request, users_db)

    if metric not in ['invites', 'codes', 'jobs', 'mothers']:
        raise ValueError(f"不支持的统计指标: {metric}")

    return {
        'metric': metric,
        'days': days,
        'data': unified_stats.get_usage_trends(days, metric),
    }


@router.get("/stats/health")
def get_health_status(
    request: Request,
    unified_stats: UnifiedStatsService = Depends(get_unified_stats_service),
    users_db: Session = Depends(get_db_users),
):
    """
    获取系统健康状态

    检查数据库连接和关键业务指标
    """
    require_admin(request, users_db)
    return unified_stats.get_health_status()


@router.get("/stats/pool-domain")
def get_pool_domain_stats(
    request: Request,
    mother_query: MotherQueryServiceDep,
    users_db: Session = Depends(get_db_users),
):
    """
    获取Pool域详细统计信息

    仅包含Pool域（Mother、Team、Seat、ChildAccount等）的统计
    """
    require_admin(request, users_db)
    return mother_query.get_quota_metrics()


@router.get("/stats/users-domain")
def get_users_domain_stats(
    request: Request,
    users_db: Session = Depends(get_db_users),
):
    """
    获取Users域详细统计信息

    仅包含Users域（Invite、RedeemCode、BatchJob等）的统计
    """
    require_admin(request, users_db)

    from app import models

    # 邀请统计
    invite_stats = _get_invite_stats(users_db)

    # 兑换码统计
    code_stats = _get_code_stats(users_db)

    # 批处理作业统计
    job_stats = _get_job_stats(users_db)

    # 审计日志统计
    audit_stats = _get_audit_stats(users_db)

    return {
        'invites': invite_stats,
        'redeem_codes': code_stats,
        'batch_jobs': job_stats,
        'audit_logs': audit_stats,
        'last_updated': datetime.utcnow().isoformat(),
    }


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