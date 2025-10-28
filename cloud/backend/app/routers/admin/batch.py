"""
批量操作相关路由
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models
from app.schemas import BatchOpIn, BatchOpOut, BatchOperationSupportedActions
from app.services.services import audit as audit_svc
from app.services.services.bulk_history import record_bulk_operation
from app.repositories import PoolRepository, UsersRepository
from app.services.services.invites import InviteService

from .dependencies import admin_ops_rate_limit_dep, get_db, get_db_pool, require_admin

router = APIRouter()


@router.get("/batch/supported-actions", response_model=BatchOperationSupportedActions)
def get_supported_batch_actions(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return BatchOperationSupportedActions()


@router.post("/batch/codes", response_model=BatchOpOut)
def batch_codes(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    action = payload.action
    ids = payload.ids or []
    confirm = bool(payload.confirm)

    if not confirm:
        raise HTTPException(status_code=400, detail="缺少确认")
    if not action or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="参数错误")

    supported_actions = BatchOperationSupportedActions()
    if action not in supported_actions.codes:
        raise HTTPException(status_code=400, detail=f"不支持的兑换码操作: {action}")

    processed = 0
    failed = 0

    if action == "disable":
        rows = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(ids)).all()
        for row in rows:
            if row.status != models.CodeStatus.used:
                row.expires_at = datetime.utcnow()
                db.add(row)
                processed += 1
            else:
                failed += 1
        db.commit()

        audit_svc.log(db, actor="admin", action="batch_disable_codes", payload_redacted=f"count={processed}")
        try:
            record_bulk_operation(
                db,
                operation_type=models.BulkOperationType.code_bulk_action,
                actor="admin",
                total_count=len(ids),
                success_count=processed,
                failed_count=failed,
                metadata={
                    "action": action,
                    "request_ip": request.client.host if request.client else None,
                },
            )
        except Exception:
            pass

        return BatchOpOut(
            success=True,
            message=f"已禁用 {processed} 个兑换码",
            processed_count=processed,
            failed_count=failed if failed > 0 else None,
        )

    raise HTTPException(status_code=400, detail="不支持的操作")


@router.post("/batch/users", response_model=BatchOpOut)
def batch_users(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    action = payload.action
    ids = payload.ids or []
    confirm = bool(payload.confirm)

    if not confirm:
        raise HTTPException(status_code=400, detail="缺少确认")
    if not action or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="参数错误")

    supported_actions = BatchOperationSupportedActions()
    if action not in supported_actions.users:
        raise HTTPException(status_code=400, detail=f"不支持的用户操作: {action}")

    success = 0
    failed = 0
    invite_service = InviteService(UsersRepository(db), PoolRepository(db_pool))

    for uid in ids:
        invite = db.query(models.InviteRequest).filter(models.InviteRequest.id == uid).first()
        if not invite or not invite.email or not invite.team_id:
            failed += 1
            continue

        email = invite.email.strip().lower()
        if action == "resend":
            ok, _ = invite_service.resend_invite(email, invite.team_id)
        elif action == "cancel":
            ok, _ = invite_service.cancel_invite(email, invite.team_id)
        elif action == "remove":
            ok, _ = invite_service.remove_member(email, invite.team_id)
        else:
            raise HTTPException(status_code=400, detail="不支持的操作")

        if ok:
            success += 1
        else:
            failed += 1

    audit_svc.log(
        db,
        actor="admin",
        action=f"batch_users_{action}",
        payload_redacted=f"success={success}, failed={failed}",
    )

    return BatchOpOut(
        success=True,
        message=f"批量操作完成：成功 {success}，失败 {failed}",
        processed_count=success,
        failed_count=failed if failed > 0 else None,
    )


__all__ = ["router"]
