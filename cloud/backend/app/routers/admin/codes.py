"""
兑换码管理相关路由
"""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from app import models
from app.schemas import BatchCodesIn, BatchCodesOut
from app.services.services import audit as audit_svc
from app.services.services.bulk_history import record_bulk_operation
from app.services.services.redeem import generate_codes
from app.utils.csrf import require_csrf_token
from app.utils.performance import monitor_session_queries

from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin

router = APIRouter()


@router.post("/codes", response_model=BatchCodesOut)
async def generate_batch_codes(
    payload: BatchCodesIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    await require_csrf_token(request)

    now = datetime.utcnow()

    team_exists = exists().where(
        (models.MotherTeam.mother_id == models.MotherAccount.id)
        & (models.MotherTeam.is_enabled == True)  # noqa: E712
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

    active_codes = (
        db.query(models.RedeemCode)
        .filter(
            models.RedeemCode.status == models.CodeStatus.unused,
            ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
        )
        .count()
    )

    remaining = max(0, free_seats - active_codes)
    if payload.count > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"数量超出配额：当前可生成 {remaining} 个（空位 {free_seats}，现有可用码 {active_codes}）",
        )

    batch_id, codes = generate_codes(db, payload.count, payload.prefix, payload.expires_at, payload.batch_id)
    audit_svc.log(db, actor="admin", action="generate_codes", payload_redacted=f"count={payload.count}, batch={batch_id}")
    try:
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.code_generate,
            actor="admin",
            total_count=payload.count,
            success_count=payload.count,
            failed_count=0,
            metadata={
                "batch_id": batch_id,
                "prefix": payload.prefix,
                "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass

    after_active = active_codes + len(codes)
    return BatchCodesOut(
        batch_id=batch_id,
        codes=codes,
        enabled_teams=None,
        max_code_capacity=free_seats,
        active_codes=after_active,
        remaining_quota=max(0, free_seats - after_active),
    )


@router.get("/export/codes")
def export_codes(request: Request, db: Session = Depends(get_db), format: str = "csv", status: str = "all"):
    require_admin(request, db)

    with monitor_session_queries(db, "admin_export_codes"):
        q = db.query(models.RedeemCode).order_by(models.RedeemCode.created_at.desc())
        if status == "unused":
            q = q.filter(models.RedeemCode.status == models.CodeStatus.unused)
        elif status == "used":
            q = q.filter(models.RedeemCode.status == models.CodeStatus.used)

        rows = q.all()

        if format == "txt":
            content = "\n".join([r.code for r in rows])
            headers = {
                "Content-Disposition": f"attachment; filename=codes-{datetime.utcnow().date()}.txt"
            }
            return PlainTextResponse(content, headers=headers)

        users_map = {}
        if rows:
            code_ids = [r.id for r in rows]
            invites = db.query(models.InviteRequest).filter(models.InviteRequest.code_id.in_(code_ids)).all()
            for invite in invites:
                if invite.code_id not in users_map:
                    users_map[invite.code_id] = invite
                else:
                    existing = users_map[invite.code_id]
                    if (
                        invite.status == models.InviteStatus.sent
                        and existing.status != models.InviteStatus.sent
                    ) or (
                        invite.status == existing.status
                        and (invite.updated_at or invite.created_at)
                        > (existing.updated_at or existing.created_at)
                    ):
                        users_map[invite.code_id] = invite

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["code", "batch_id", "is_used", "created_at", "used_by", "used_at"])
        for row in rows:
            invite = users_map.get(row.id)
            writer.writerow(
                [
                    row.code,
                    row.batch_id or "",
                    "1" if row.is_used else "0",
                    row.created_at.isoformat() if row.created_at else "",
                    invite.email if invite else "",
                    invite.updated_at.isoformat() if invite and row.is_used and invite.updated_at else "",
                ]
            )

        headers = {
            "Content-Disposition": f"attachment; filename=codes-{datetime.utcnow().date()}.csv"
        }
        return Response(output.getvalue(), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/codes")
def list_codes(
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    require_admin(request, db)

    with monitor_session_queries(db, "admin_list_codes"):
        query = db.query(models.RedeemCode)

        status_value = (status or "").strip().lower()
        if status_value:
            try:
                status_enum = models.CodeStatus(status_value)
            except ValueError:
                raise HTTPException(status_code=400, detail="无效的兑换码状态")
            query = query.filter(models.RedeemCode.status == status_enum)

        search_value = (search or "").strip()
        if search_value:
            like = f"%{search_value.lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.RedeemCode.code_hash).like(like),
                    func.lower(models.RedeemCode.batch_id).like(like),
                    func.lower(models.RedeemCode.used_by_email).like(like),
                    func.lower(models.RedeemCode.used_by_team_id).like(like),
                )
            )

        total = query.count()
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
        codes = (
            query.order_by(models.RedeemCode.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
        if not codes:
            return {
                "items": [],
                "pagination": {
                    "page": current_page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": total_pages,
                },
            }

        code_ids = [c.id for c in codes]
        invites = (
            db.query(models.InviteRequest)
            .filter(models.InviteRequest.code_id.in_(code_ids))
            .all()
        )
        inv_by_code = {}
        fallback_inv = {}
        for invite in invites:
            cid = invite.code_id
            if invite.status == models.InviteStatus.sent:
                previous = inv_by_code.get(cid)
                if (
                    not previous
                    or (invite.updated_at and invite.updated_at > (previous.updated_at or invite.updated_at))
                ):
                    inv_by_code[cid] = invite
            prev_any = fallback_inv.get(cid)
            if (
                not prev_any
                or (invite.created_at or invite.updated_at)
                > (prev_any.created_at or prev_any.updated_at)
            ):
                fallback_inv[cid] = invite
        for cid, inv in fallback_inv.items():
            inv_by_code.setdefault(cid, inv)

        mother_ids = set()
        team_ids = set()
        for code in codes:
            if code.used_by_mother_id:
                mother_ids.add(code.used_by_mother_id)
            if code.used_by_team_id:
                team_ids.add(code.used_by_team_id)
            invite = inv_by_code.get(code.id)
            if invite:
                if invite.mother_id:
                    mother_ids.add(invite.mother_id)
                if invite.team_id:
                    team_ids.add(invite.team_id)

        mothers_map = {}
        teams_map = {}

        if mother_ids:
            mothers = db.query(models.MotherAccount).filter(models.MotherAccount.id.in_(mother_ids)).all()
            mothers_map = {m.id: m.name for m in mothers}

        if team_ids:
            teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
            teams_map = {t.team_id: (t.team_name or "") for t in teams}

        items = []
        for code in codes:
            invite = inv_by_code.get(code.id)
            map_email = code.used_by_email or (invite.email if invite else None)
            map_mother_id = code.used_by_mother_id or (invite.mother_id if invite else None)
            map_team_id = code.used_by_team_id or (invite.team_id if invite else None)
            mother_name = mothers_map.get(map_mother_id) if map_mother_id else None
            team_name = teams_map.get(map_team_id) if map_team_id else None

            items.append(
                {
                    "id": code.id,
                    "code": code.code,
                    "batch_id": code.batch_id,
                    "is_used": code.is_used,
                    "expires_at": code.expires_at.isoformat() if code.expires_at else None,
                    "created_at": code.created_at.isoformat() if code.created_at else None,
                    "used_by": map_email,
                    "used_at": (
                        code.used_at.isoformat()
                        if code.used_at
                        else (invite.updated_at.isoformat() if invite and code.is_used and invite.updated_at else None)
                    ),
                    "mother_id": map_mother_id,
                    "mother_name": mother_name,
                    "team_id": map_team_id,
                    "team_name": team_name,
                    "invite_status": invite.status.value if invite else None,
                }
            )

        return {
            "items": items,
            "pagination": {
                "page": current_page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
            },
        }


@router.post("/codes/{code_id}/disable")
def disable_code(
    code_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    code = db.query(models.RedeemCode).filter(models.RedeemCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="兑换码不存在")

    if code.is_used:
        raise HTTPException(status_code=400, detail="已使用的兑换码无法禁用")

    code.expires_at = datetime.utcnow()
    db.add(code)
    db.commit()

    audit_svc.log(db, actor="admin", action="disable_code", target_type="code", target_id=str(code_id))
    return {"ok": True, "message": "兑换码已禁用"}


__all__ = ["router"]
