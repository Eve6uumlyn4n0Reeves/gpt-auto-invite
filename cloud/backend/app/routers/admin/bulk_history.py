"""
管理员批量历史记录相关路由
"""
import json

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models

from .dependencies import get_db, require_admin

router = APIRouter()


@router.get("/bulk/history")
def bulk_history(
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量，默认50，最大200"),
):
    """列出最近的批量操作记录"""
    require_admin(request, db)

    total = db.query(func.count(models.BulkOperationLog.id)).scalar() or 0
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
        db.query(models.BulkOperationLog)
        .order_by(models.BulkOperationLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        {
            "id": log.id,
            "operation_type": (
                log.operation_type.value if isinstance(log.operation_type, models.BulkOperationType) else str(log.operation_type)
            ),
            "actor": log.actor,
            "total_count": log.total_count,
            "success_count": log.success_count,
            "failed_count": log.failed_count,
            "metadata": json.loads(log.metadata_json or "{}"),
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
