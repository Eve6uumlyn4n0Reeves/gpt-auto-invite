"""
管理员配额快照相关路由
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import exists
from sqlalchemy.orm import Session

from app import models

from .dependencies import get_db, require_admin

router = APIRouter()


@router.get("/quota")
def quota_snapshot(request: Request, db: Session = Depends(get_db)):
    """返回当前兑换码与席位配额摘要"""
    require_admin(request, db)

    now = datetime.utcnow()

    total_codes = db.query(models.RedeemCode).count()
    used_codes = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()
    active_codes = (
        db.query(models.RedeemCode)
        .filter(
            models.RedeemCode.status == models.CodeStatus.unused,
            ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
        )
        .count()
    )

    team_exists = exists().where(
        (models.MotherTeam.mother_id == models.MotherAccount.id) & (models.MotherTeam.is_enabled == True)  # noqa: E712
    )
    free_seats = (
        db.query(models.SeatAllocation)
        .join(models.MotherAccount, models.SeatAllocation.mother_id == models.MotherAccount.id)
        .filter(
            models.MotherAccount.status == models.MotherStatus.active,
            models.SeatAllocation.status == models.SeatStatus.free,
            team_exists,
        )
        .count()
    )
    used_seats = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
        .count()
    )

    pending_invites = (
        db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()
    )

    remaining_quota = max(0, free_seats - active_codes)

    return {
        "total_codes": total_codes,
        "used_codes": used_codes,
        "active_codes": active_codes,
        "max_code_capacity": free_seats,
        "remaining_quota": remaining_quota,
        "used_seats": used_seats,
        "pending_invites": pending_invites,
        "generated_at": now.isoformat(),
    }


__all__ = ["router"]
