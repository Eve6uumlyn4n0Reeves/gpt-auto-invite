"""
管理员邀请相关路由
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.schemas import CancelInviteIn, RemoveMemberIn, ResendIn
from app.services.services.invites import cancel_invite, remove_member, resend_invite

from .dependencies import admin_ops_rate_limit_dep, get_db, get_db_pool, require_admin

router = APIRouter()


@router.post("/resend")
def resend_invite_route(
    payload: ResendIn,
    request: Request,
    db: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    ok, msg = resend_invite(db, db_pool, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/cancel-invite")
def cancel_invite_route(
    payload: CancelInviteIn,
    request: Request,
    db: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    ok, msg = cancel_invite(db, db_pool, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/remove-member")
def remove_member_route(
    payload: RemoveMemberIn,
    request: Request,
    db: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    ok, msg = remove_member(db, db_pool, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


__all__ = ["router"]
