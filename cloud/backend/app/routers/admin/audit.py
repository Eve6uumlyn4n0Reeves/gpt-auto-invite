"""
管理员审计日志相关路由
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models

from .dependencies import get_db, require_admin

router = APIRouter()


@router.get("/audit-logs")
def list_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量，默认50，最大200"),
):
    require_admin(request, db)
    # 建议传 X-Domain=users；读取接口不强制

    total = db.query(func.count(models.AuditLog.id)).scalar() or 0
    if total == 0:
        return {
            "items": [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": 0,
                "total_pages": 0,
            },
        }

    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = max(1, min(page, total_pages))
    offset = (current_page - 1) * page_size

    logs = (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        {
            "id": log.id,
            "actor": log.actor,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "payload_redacted": log.payload_redacted,
            "ip": log.ip,
            "ua": log.ua,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]

    return {
        "items": items,
        "pagination": {
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


__all__ = ["router"]
