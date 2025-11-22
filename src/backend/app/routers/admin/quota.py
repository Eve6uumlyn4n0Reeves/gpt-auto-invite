"""
管理员配额快照相关路由
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.services.services.quota_service import QuotaService
from .dependencies import get_db, get_db_pool, require_admin

router = APIRouter()


@router.get("/quota")
def quota_snapshot(
    request: Request,
    db_users: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
):
    """返回当前兑换码与席位配额摘要（统一自 QuotaService）"""
    require_admin(request, db_users)
    snapshot = QuotaService.get_quota_snapshot(db_users, db_pool)
    return snapshot.to_dict()


__all__ = ["router"]
