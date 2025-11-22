from typing import List

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app import models
from app.schemas import SwitchAdminIn, SwitchRequestOut
from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository
from app.services.services.switch import SwitchService
from app.utils.csrf import require_csrf_token

from .dependencies import (
    admin_ops_rate_limit_dep,
    get_db,
    get_db_pool,
    require_admin,
    require_domain,
)

router = APIRouter()


@router.post("/switch")
async def admin_switch(
    payload: SwitchAdminIn,
    request: Request,
    db_users: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db_users)
    await require_domain("users")(request)
    await require_csrf_token(request)

    svc = SwitchService(UsersRepository(db_users), MotherRepository(db_pool))
    result = svc.switch_email(payload.email, code_plain=payload.code, allow_queue=True)
    response = {
        "success": result.success,
        "message": result.message,
        "queued": result.queued,
    }
    if result.request:
        response["request_id"] = result.request.id
    if result.team_id:
        response["team_id"] = result.team_id
    return response


@router.get("/switch/requests", response_model=List[SwitchRequestOut])
async def list_switch_requests(
    request: Request,
    db_users: Session = Depends(get_db),
):
    require_admin(request, db_users)
    await require_domain("users")(request)

    rows = (
        db_users.query(models.SwitchRequest)
        .order_by(models.SwitchRequest.created_at.desc())
        .limit(200)
        .all()
    )
    outputs: list[SwitchRequestOut] = []
    for row in rows:
        outputs.append(
            SwitchRequestOut(
                id=row.id,
                email=row.email,
                redeem_code_id=row.redeem_code_id,
                status=row.status.value if row.status else "pending",
                reason=row.reason,
                attempts=row.attempts or 0,
                queued_at=row.queued_at,
                expires_at=row.expires_at,
                last_error=row.last_error,
            )
        )
    return outputs

