"""
兑换码管理相关路由
"""
import csv
import io
import hashlib
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.schemas import (
    BatchCodesIn,
    BatchCodesOut,
    CodeSkuCreateIn,
    CodeSkuUpdateIn,
    CodeSkuOut,
)
from app.services.services import audit as audit_svc
from app.services.services.bulk_history import record_bulk_operation
from app.services.services.redeem import generate_codes
from app.services.services.code_sku_service import CodeSkuService
from app.services.shared.capacity_guard import CapacityGuard, CapacityGuardError
from app.repositories import UsersRepository
from app.utils.csrf import require_csrf_token
from app.utils.performance import monitor_session_queries
from app.utils.pagination import compute_pagination

from .dependencies import admin_ops_rate_limit_dep, get_db, get_db_pool, require_admin, require_domain

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/codes", response_model=BatchCodesOut)
async def generate_batch_codes(
    payload: BatchCodesIn,
    request: Request,
    db_users: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db_users)
    await require_domain('users')(request)
    await require_csrf_token(request)

    repo = UsersRepository(db_users)
    sku = repo.get_code_sku_by_slug(payload.sku_slug)
    if not sku:
        raise HTTPException(status_code=400, detail="指定的兑换码商品不可用")

    guard = CapacityGuard(db_users, db_pool)
    try:
        capacity_snapshot = guard.ensure_capacity(payload.count)
    except CapacityGuardError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        batch_id, codes = generate_codes(
            db_users,
            payload.count,
            payload.prefix,
            payload.expires_at,
            payload.batch_id,
            sku_slug=payload.sku_slug,
            lifecycle_plan=payload.lifecycle_plan,
            switch_limit=payload.switch_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # 如果指定了用户组，将 group_id 直接写入列（不再使用 meta_json）
    if payload.mother_group_id:
        for code_hash in [hashlib.sha256(c.encode()).hexdigest() for c in codes]:
            code_row = (
                db_users.query(models.RedeemCode)
                .filter(models.RedeemCode.code_hash == code_hash)
                .first()
            )
            if code_row:
                code_row.mother_group_id = payload.mother_group_id
                db_users.add(code_row)
        db_users.commit()

    audit_svc.log(
        db_users,
        actor="admin",
        action="generate_codes",
        payload_redacted=f"count={payload.count}, batch={batch_id}, group={payload.mother_group_id or 'all'}",
    )
    try:
        record_bulk_operation(
            db_users,
            operation_type=models.BulkOperationType.code_generate,
            actor="admin",
            total_count=payload.count,
            success_count=payload.count,
            failed_count=0,
            metadata={
                "batch_id": batch_id,
                "prefix": payload.prefix,
                "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
                "mother_group_id": payload.mother_group_id,
                "lifecycle_plan": payload.lifecycle_plan,
                "switch_limit": payload.switch_limit,
                "sku_slug": payload.sku_slug,
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception as e:
        logger.warning("record_bulk_operation failed: %s", e)

    after_active = capacity_snapshot.reserved_codes + len(codes)
    remaining_quota = max(0, capacity_snapshot.total_slots - after_active)
    return BatchCodesOut(
        batch_id=batch_id,
        codes=codes,
        enabled_teams=None,
        max_code_capacity=capacity_snapshot.total_slots,
        active_codes=after_active,
        remaining_quota=remaining_quota,
        sku_slug=payload.sku_slug,
    )


@router.get("/codes/skus", response_model=list[CodeSkuOut])
def list_code_skus(
    request: Request,
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    service = CodeSkuService(UsersRepository(db))
    return service.list_skus(include_inactive=include_inactive)


@router.post("/codes/skus", response_model=CodeSkuOut)
def create_code_sku(
    payload: CodeSkuCreateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    service = CodeSkuService(UsersRepository(db))
    try:
        sku = service.create_sku(
            name=payload.name,
            slug=payload.slug,
            description=payload.description,
            lifecycle_days=payload.lifecycle_days,
            default_refresh_limit=payload.default_refresh_limit,
            price_cents=payload.price_cents,
            is_active=payload.is_active,
        )
        db.commit()
        return sku
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/codes/skus/{sku_id}", response_model=CodeSkuOut)
def update_code_sku(
    sku_id: int,
    payload: CodeSkuUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    service = CodeSkuService(UsersRepository(db))
    try:
        sku = service.update_sku(
            sku_id,
            name=payload.name,
            description=payload.description,
            lifecycle_days=payload.lifecycle_days,
            default_refresh_limit=payload.default_refresh_limit,
            price_cents=payload.price_cents,
            is_active=payload.is_active,
        )
        db.commit()
        return sku
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


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
    # 只读接口可不强制域，但建议前端仍传 X-Domain=users

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
        meta, offset = compute_pagination(total, page, page_size)
        if total == 0:
            return {"items": [], "pagination": meta.as_dict()}
        codes = (
            query.order_by(models.RedeemCode.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
        if not codes:
            return {"items": [], "pagination": meta.as_dict()}

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

        team_ids = set()
        for code in codes:
            if code.used_by_team_id:
                team_ids.add(code.used_by_team_id)
            invite = inv_by_code.get(code.id)
            if invite:
                if invite.team_id:
                    team_ids.add(invite.team_id)

        teams_map = {}

        if team_ids:
            teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
            teams_map = {t.team_id: (t.team_name or "") for t in teams}

        items = []
        for code in codes:
            invite = inv_by_code.get(code.id)
            map_email = code.used_by_email or (invite.email if invite else None)
            map_team_id = code.used_by_team_id or (invite.team_id if invite else None)
            team_name = teams_map.get(map_team_id) if map_team_id else None
            sku_slug = None
            try:
                sku = getattr(code, "sku", None)
                if sku:
                    sku_slug = sku.slug
            except Exception:
                sku_slug = None

            items.append(
                {
                    "id": code.id,
                    "code": code.code,
                    "batch_id": code.batch_id,
                    "is_used": code.is_used,
                    "status": code.status.value if hasattr(code, 'status') and code.status is not None else ("used" if code.is_used else "unused"),
                    "expires_at": code.expires_at.isoformat() if code.expires_at else None,
                    "created_at": code.created_at.isoformat() if code.created_at else None,
                    "used_by": map_email,
                    "used_at": (
                        code.used_at.isoformat()
                        if code.used_at
                        else (invite.updated_at.isoformat() if invite and code.is_used and invite.updated_at else None)
                    ),
                    "team_id": map_team_id,
                    "team_name": team_name,
                    "invite_status": invite.status.value if invite else None,
                    "lifecycle_plan": (
                        code.lifecycle_plan.value
                        if getattr(code, "lifecycle_plan", None)
                        else None
                    ),
                    "lifecycle_started_at": code.lifecycle_started_at.isoformat() if getattr(code, "lifecycle_started_at", None) else None,
                    "lifecycle_expires_at": code.lifecycle_expires_at.isoformat() if getattr(code, "lifecycle_expires_at", None) else None,
                    "switch_limit": code.switch_limit,
                    "switch_count": code.switch_count,
                    "active": bool(code.active) if getattr(code, "active", None) is not None else True,
                    "sku_slug": sku_slug,
                    "refresh_limit": code.refresh_limit,
                    "refresh_used": code.refresh_used,
                    "refresh_cooldown_until": code.refresh_cooldown_until.isoformat()
                    if getattr(code, "refresh_cooldown_until", None)
                    else None,
                    "bound_email": code.bound_email,
                }
            )

        return {"items": items, "pagination": meta.as_dict()}


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
