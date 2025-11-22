"""
管理员性能监控相关路由
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.utils.performance import query_monitor
from app.services.services import audit as audit_svc

from .dependencies import get_db, require_admin

router = APIRouter()


@router.get("/performance/stats")
def performance_stats(request: Request, db: Session = Depends(get_db)):
    """获取查询性能统计信息"""
    require_admin(request, db)
    stats = query_monitor.get_stats()
    slow_queries = query_monitor.get_slow_queries()
    return {
        "total_operations": len(stats),
        "operations": stats,
        "slow_queries": slow_queries,
        "enabled": query_monitor.enabled,
    }


@router.post("/performance/reset")
def reset_performance_stats(request: Request, db: Session = Depends(get_db)):
    """重置性能统计信息"""
    require_admin(request, db)
    query_monitor.reset_stats()
    audit_svc.log(db, actor="admin", action="reset_performance_stats")
    return {"ok": True, "message": "性能统计已重置"}


@router.post("/performance/toggle")
def toggle_performance_monitoring(request: Request, db: Session = Depends(get_db)):
    """开启/关闭性能监控"""
    require_admin(request, db)

    if query_monitor.enabled:
        query_monitor.disable()
        status = "已关闭"
    else:
        query_monitor.enable()
        status = "已开启"

    audit_svc.log(db, actor="admin", action="toggle_performance_monitoring", payload_redacted=f"status={status}")
    return {"ok": True, "message": f"性能监控{status}", "enabled": query_monitor.enabled}


__all__ = ["router"]
