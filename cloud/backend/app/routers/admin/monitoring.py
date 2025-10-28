"""
监控和可观测性路由。

提供业务指标、健康检查、系统状态等监控相关的API。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db_users, get_db_pool
from app.monitoring.metrics import business_metrics, DatabaseMetricsCollector, health_checker
from app.routers.admin.dependencies import require_admin

router = APIRouter()

# 数据库指标收集器
db_metrics_collector = DatabaseMetricsCollector()


@router.get("/metrics")
def get_metrics(
    request: Request,
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
):
    """
    获取Prometheus格式的业务指标

    支持Prometheus等监控系统抓取
    """
    # 收集最新的数据库指标
    db_metrics_collector.collect_database_metrics(users_db, pool_db)

    # 返回指标文本
    metrics_text = business_metrics.get_metrics_text()

    return Response(
        content=metrics_text,
        media_type="text/plain; version=0.0.4; charset=utf-8"
    )


@router.get("/health")
def get_health_check(
    request: Request,
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
):
    """
    获取系统健康状态

    检查各个组件的健康状况
    """
    # 设置默认健康检查（如果还没有设置）
    if not health_checker.checks:
        from app.monitoring.metrics import setup_default_health_checks
        setup_default_health_checks()

    # 运行健康检查
    health_status = health_checker.run_checks()

    return health_status


@router.get("/monitoring/overview")
def get_monitoring_overview(
    request: Request,
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
):
    """
    获取监控总览

    提供业务关键指标的概览信息
    """
    require_admin(request, users_db)

    from app import models

    overview = {
        "timestamp": datetime.utcnow().isoformat(),
        "business_metrics": {},
        "system_metrics": {},
        "alerts": []
    }

    try:
        # 业务指标 - Users域
        total_invites = users_db.query(models.InviteRequest).count()
        accepted_invites = users_db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.accepted
        ).count()

        overview["business_metrics"]["invites"] = {
            "total": total_invites,
            "accepted": accepted_invites,
            "success_rate": round(accepted_invites / total_invites * 100, 2) if total_invites > 0 else 0,
        }

        # 兑换码统计
        total_codes = users_db.query(models.RedeemCode).count()
        used_codes = users_db.query(models.RedeemCode).filter(
            models.RedeemCode.status == models.CodeStatus.used
        ).count()

        overview["business_metrics"]["redeem_codes"] = {
            "total": total_codes,
            "used": used_codes,
            "usage_rate": round(used_codes / total_codes * 100, 2) if total_codes > 0 else 0,
        }

        # 批处理作业统计
        total_jobs = users_db.query(models.BatchJob).count()
        failed_jobs = users_db.query(models.BatchJob).filter(
            models.BatchJob.status == 'failed'
        ).count()

        overview["business_metrics"]["batch_jobs"] = {
            "total": total_jobs,
            "failed": failed_jobs,
            "failure_rate": round(failed_jobs / total_jobs * 100, 2) if total_jobs > 0 else 0,
        }

        # 业务指标 - Pool域
        total_mothers = pool_db.query(models.MotherAccount).count()
        active_mothers = pool_db.query(models.MotherAccount).filter(
            models.MotherAccount.status == models.MotherStatus.active
        ).count()
        invalid_mothers = pool_db.query(models.MotherAccount).filter(
            models.MotherAccount.status == models.MotherStatus.invalid
        ).count()

        overview["business_metrics"]["mothers"] = {
            "total": total_mothers,
            "active": active_mothers,
            "invalid": invalid_mothers,
            "invalid_rate": round(invalid_mothers / total_mothers * 100, 2) if total_mothers > 0 else 0,
        }

        # 子账号统计
        total_children = pool_db.query(models.ChildAccount).count()
        active_children = pool_db.query(models.ChildAccount).filter(
            models.ChildAccount.status == 'active'
        ).count()

        overview["business_metrics"]["child_accounts"] = {
            "total": total_children,
            "active": active_children,
        }

        # 席位统计
        total_seats = pool_db.query(models.SeatAllocation).count()
        used_seats = pool_db.query(models.SeatAllocation).filter(
            models.SeatAllocation.status.in_(['held', 'used'])
        ).count()

        overview["business_metrics"]["seats"] = {
            "total": total_seats,
            "used": used_seats,
            "available": total_seats - used_seats,
            "utilization_rate": round(used_seats / total_seats * 100, 2) if total_seats > 0 else 0,
        }

        # 系统指标
        overview["system_metrics"] = {
            "database_status": {
                "users_db": "connected",
                "pool_db": "connected",
            },
            "uptime": "unknown",  # 可以添加实际运行时间计算
        }

        # 告警检查
        if invalid_mothers / total_mothers > 0.2:
            overview["alerts"].append({
                "level": "warning",
                "message": f"无效Mother账号比例过高: {invalid_mothers / total_mothers * 100:.1f}%",
                "metric": "mother_invalid_rate",
                "value": invalid_mothers / total_mothers * 100,
                "threshold": 20.0,
            })

        if failed_jobs / total_jobs > 0.1:
            overview["alerts"].append({
                "level": "error",
                "message": f"批处理作业失败率过高: {failed_jobs / total_jobs * 100:.1f}%",
                "metric": "batch_job_failure_rate",
                "value": failed_jobs / total_jobs * 100,
                "threshold": 10.0,
            })

    except Exception as e:
        overview["error"] = str(e)
        overview["alerts"].append({
            "level": "error",
            "message": f"收集监控指标失败: {str(e)}",
        })

    return overview


@router.get("/monitoring/trends")
def get_monitoring_trends(
    request: Request,
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
    days: int = 7,
    metric: str = "invites",
):
    """
    获取监控趋势数据

    Args:
        days: 统计天数
        metric: 统计指标类型
    """
    require_admin(request, users_db)

    if metric not in ['invites', 'codes', 'jobs', 'mothers', 'children']:
        raise ValueError(f"不支持的统计指标: {metric}")

    trends = []
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)

    for i in range(days):
        current_date = start_date + timedelta(days=i)
        day_start = datetime.combine(current_date, datetime.min.time())
        day_end = datetime.combine(current_date, datetime.max.time())

        if metric == 'invites':
            from app import models
            count = users_db.query(models.InviteRequest).filter(
                models.InviteRequest.created_at >= day_start,
                models.InviteRequest.created_at <= day_end
            ).count()
        elif metric == 'codes':
            from app import models
            count = users_db.query(models.RedeemCode).filter(
                models.RedeemCode.used_at >= day_start,
                models.RedeemCode.used_at <= day_end
            ).count()
        elif metric == 'jobs':
            from app import models
            count = users_db.query(models.BatchJob).filter(
                models.BatchJob.created_at >= day_start,
                models.BatchJob.created_at <= day_end
            ).count()
        elif metric == 'mothers':
            from app import models
            count = pool_db.query(models.MotherAccount).filter(
                models.MotherAccount.created_at >= day_start,
                models.MotherAccount.created_at <= day_end
            ).count()
        elif metric == 'children':
            from app import models
            count = pool_db.query(models.ChildAccount).filter(
                models.ChildAccount.created_at >= day_start,
                models.ChildAccount.created_at <= day_end
            ).count()
        else:
            count = 0

        trends.append({
            "date": current_date.isoformat(),
            "count": count,
        })

    return {
        "metric": metric,
        "days": days,
        "data": trends,
    }


@router.get("/monitoring/alerts")
def get_monitoring_alerts(
    request: Request,
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
    level: Optional[str] = None,
):
    """
    获取监控告警

    Args:
        level: 告警级别过滤 (error, warning, info)
    """
    require_admin(request, users_db)

    alerts = []
    from app import models

    try:
        # 检查Mother账号状态
        total_mothers = pool_db.query(models.MotherAccount).count()
        if total_mothers > 0:
            invalid_mothers = pool_db.query(models.MotherAccount).filter(
                models.MotherAccount.status == models.MotherStatus.invalid
            ).count()
            invalid_rate = invalid_mothers / total_mothers * 100

            if invalid_rate > 30:
                alerts.append({
                    "id": f"mother_invalid_rate_{int(datetime.utcnow().timestamp())}",
                    "level": "error",
                    "title": "Mother账号失效比例严重",
                    "message": f"无效Mother账号比例达到 {invalid_rate:.1f}%",
                    "metric": "mother_invalid_rate",
                    "value": invalid_rate,
                    "threshold": 30.0,
                    "created_at": datetime.utcnow().isoformat(),
                })
            elif invalid_rate > 20:
                alerts.append({
                    "id": f"mother_invalid_rate_{int(datetime.utcnow().timestamp())}",
                    "level": "warning",
                    "title": "Mother账号失效比例偏高",
                    "message": f"无效Mother账号比例为 {invalid_rate:.1f}%",
                    "metric": "mother_invalid_rate",
                    "value": invalid_rate,
                    "threshold": 20.0,
                    "created_at": datetime.utcnow().isoformat(),
                })

        # 检查批处理作业状态
        total_jobs = users_db.query(models.BatchJob).count()
        if total_jobs > 0:
            failed_jobs = users_db.query(models.BatchJob).filter(
                models.BatchJob.status == 'failed'
            ).count()
            failure_rate = failed_jobs / total_jobs * 100

            if failure_rate > 15:
                alerts.append({
                    "id": f"job_failure_rate_{int(datetime.utcnow().timestamp())}",
                    "level": "error",
                    "title": "批处理作业失败率严重",
                    "message": f"批处理作业失败率达到 {failure_rate:.1f}%",
                    "metric": "batch_job_failure_rate",
                    "value": failure_rate,
                    "threshold": 15.0,
                    "created_at": datetime.utcnow().isoformat(),
                })
            elif failure_rate > 10:
                alerts.append({
                    "id": f"job_failure_rate_{int(datetime.utcnow().timestamp())}",
                    "level": "warning",
                    "title": "批处理作业失败率偏高",
                    "message": f"批处理作业失败率为 {failure_rate:.1f}%",
                    "metric": "batch_job_failure_rate",
                    "value": failure_rate,
                    "threshold": 10.0,
                    "created_at": datetime.utcnow().isoformat(),
                })

        # 检查席位利用率
        total_seats = pool_db.query(models.SeatAllocation).count()
        if total_seats > 0:
            used_seats = pool_db.query(models.SeatAllocation).filter(
                models.SeatAllocation.status.in_(['held', 'used'])
            ).count()
            utilization_rate = used_seats / total_seats * 100

            if utilization_rate > 90:
                alerts.append({
                    "id": f"seat_utilization_high_{int(datetime.utcnow().timestamp())}",
                    "level": "warning",
                    "title": "席位利用率过高",
                    "message": f"席位利用率达到 {utilization_rate:.1f}%",
                    "metric": "seat_utilization_rate",
                    "value": utilization_rate,
                    "threshold": 90.0,
                    "created_at": datetime.utcnow().isoformat(),
                })

        # 按级别过滤
        if level:
            alerts = [alert for alert in alerts if alert["level"] == level]

        # 按时间排序（最新的在前）
        alerts.sort(key=lambda x: x["created_at"], reverse=True)

    except Exception as e:
        alerts.append({
            "id": f"monitoring_error_{int(datetime.utcnow().timestamp())}",
            "level": "error",
            "title": "监控检查失败",
            "message": f"检查监控指标时发生错误: {str(e)}",
            "created_at": datetime.utcnow().isoformat(),
        })

    return {
        "alerts": alerts,
        "total": len(alerts),
        "last_updated": datetime.utcnow().isoformat(),
    }


@router.post("/monitoring/test-metric")
def test_metric(
    request: Request,
    users_db: Session = Depends(get_db_users),
):
    """
    测试指标收集

    用于验证指标收集功能是否正常工作
    """
    require_admin(request, users_db)

    from app.monitoring.metrics import business_metrics

    # 测试各种类型的指标
    business_metrics.increment_counter("test_counter", {"type": "test"}, 1)
    business_metrics.record_histogram("test_histogram", 0.123, {"type": "test"})
    business_metrics.set_gauge("test_gauge", 42.0, {"type": "test"})

    return {
        "message": "测试指标已记录",
        "metrics_endpoint": "/api/admin/metrics",
        "health_endpoint": "/api/admin/health",
    }