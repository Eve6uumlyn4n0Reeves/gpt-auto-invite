import hashlib
import os
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import update, select
from datetime import datetime, timedelta
from app import models
from app.config import settings
from app.services.services.invites import InviteService
from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository
from app.database import SessionPool


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_codes(
    db: Session,
    count: int,
    prefix: Optional[str],
    expires_at: Optional[datetime],
    batch_id: Optional[str],
    *,
    sku_slug: str,
    lifecycle_plan: Optional[str] = None,
    switch_limit: Optional[int] = None,
) -> Tuple[str, list[str]]:
    batch = batch_id or datetime.utcnow().strftime("%Y%m%d%H%M%S")
    codes: list[str] = []
    resolved_plan = settings.resolve_lifecycle_plan(lifecycle_plan)
    resolved_switch_limit = (
        switch_limit if switch_limit is not None else settings.code_default_switch_limit
    )
    users_repo = UsersRepository(db)
    sku = users_repo.get_code_sku_by_slug(sku_slug)
    if not sku:
        raise ValueError(f"未找到 SKU:{sku_slug}")

    if resolved_switch_limit is not None:
        resolved_switch_limit = max(1, min(100, resolved_switch_limit))

    for _ in range(count):
        rand = base36(os.urandom(16))
        code = f"{prefix}{rand}" if prefix else rand
        codes.append(code)
        db.add(
            models.RedeemCode(
                code_hash=hash_code(code),
                batch_id=batch,
                expires_at=expires_at,
                lifecycle_plan=models.RedeemCodeLifecycle(resolved_plan),
                switch_limit=resolved_switch_limit,
                switch_count=0,
                active=True,
                sku_id=sku.id,
                refresh_limit=sku.default_refresh_limit,
            )
        )

    db.commit()
    return batch, codes


def base36(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(alphabet[r])
    s = "".join(reversed(out)) or "0"
    return s


def redeem_code(
    db: Session, code: str, email: str
) -> Tuple[bool, str, Optional[int], Optional[int], Optional[str]]:
    """
    Atomic redemption to prevent double-spend under concurrency.
    Strategy:
    - PostgreSQL: row-level lock + state check, then set to blocked
    - Others: CAS update from unused -> blocked
    - On success: mark code used; on failure: rollback to unused
    """
    h = hash_code(code)
    now = datetime.utcnow()

    # Inspect DB dialect
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    is_pg = bool(dialect and getattr(dialect, "name", "").startswith("postgres"))

    row: Optional[models.RedeemCode] = None

    if is_pg:
        # Row-level lock to avoid concurrent read of the same code
        row = db.execute(
            select(models.RedeemCode)
            .where(models.RedeemCode.code_hash == h)
            .with_for_update(skip_locked=True)
        ).scalars().first()

        if not row:
            return False, "\u5151\u6362\u7801\u65e0\u6548", None, None, None
        if row.status != models.CodeStatus.unused:
            return False, "\u5151\u6362\u7801\u5df2\u4f7f\u7528\u6216\u4e0d\u53ef\u7528", None, None, None
        if row.expires_at and row.expires_at < now:
            return False, "\u5151\u6362\u7801\u5df2\u8fc7\u671f", None, None, None

        row.status = models.CodeStatus.blocked
        db.add(row)
        db.commit()
    else:
        # CAS: unused -> blocked if not expired
        res = db.execute(
            update(models.RedeemCode)
            .where(
                models.RedeemCode.code_hash == h,
                models.RedeemCode.status == models.CodeStatus.unused,
                ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
            )
            .values(status=models.CodeStatus.blocked)
        )
        if res.rowcount != 1:
            # Re-check to return accurate message
            row = db.query(models.RedeemCode).filter(models.RedeemCode.code_hash == h).first()
            if not row:
                return False, "\u5151\u6362\u7801\u65e0\u6548", None, None, None
            if row.expires_at and row.expires_at < now:
                return False, "\u5151\u6362\u7801\u5df2\u8fc7\u671f", None, None, None
            return False, "\u5151\u6362\u7801\u5df2\u4f7f\u7528\u6216\u4e0d\u53ef\u7528", None, None, None
        db.commit()
        row = db.query(models.RedeemCode).filter(models.RedeemCode.code_hash == h).first()

    if not row:
        return False, "\u5151\u6362\u7801\u65e0\u6548", None, None, None

    lifecycle_expired = bool(row.lifecycle_expires_at and row.lifecycle_expires_at < now)
    if lifecycle_expired:
        row.active = False
        db.add(row)
        db.commit()
        return False, "\u5151\u6362\u7801\u5df2\u8fc7\u671f", None, None, None

    if row.active is False:
        return False, "\u5151\u6362\u7801\u5df2\u505c\u7528", None, None, None

    # Invite
    users_repo = UsersRepository(db)
    pool_session = None
    try:
        pool_session = SessionPool()
        mother_repo = MotherRepository(pool_session)
        svc = InviteService(users_repo, mother_repo)
        ok, msg, invite_id, mother_id, team_id = svc.invite_email(email, row)

        # Redundant safeguard for success
        if ok:
            if row:
                now = datetime.utcnow()
                if isinstance(row.lifecycle_plan, models.RedeemCodeLifecycle):
                    plan_value = row.lifecycle_plan.value
                elif isinstance(row.lifecycle_plan, str) and row.lifecycle_plan:
                    plan_value = row.lifecycle_plan.lower()
                else:
                    plan_value = settings.resolve_lifecycle_plan(None)
                if not isinstance(row.lifecycle_plan, models.RedeemCodeLifecycle):
                    row.lifecycle_plan = models.RedeemCodeLifecycle(plan_value)
                if row.lifecycle_started_at is None:
                    row.lifecycle_started_at = now
                    duration_days = settings.lifecycle_duration_days(plan_value)
                    row.lifecycle_expires_at = row.lifecycle_started_at + timedelta(days=duration_days)
                if row.switch_limit is None:
                    row.switch_limit = max(1, settings.code_default_switch_limit)
                if row.refresh_limit is None:
                    sku = getattr(row, "sku", None)
                    if sku and sku.default_refresh_limit is not None:
                        row.refresh_limit = sku.default_refresh_limit

                first_bind = not row.bound_email
                row.active = True
                row.status = models.CodeStatus.used
                row.used_by_email = email
                row.used_by_team_id = team_id
                row.used_at = now
                if first_bind:
                    row.bound_email = email
                    row.bound_team_id = team_id
                    row.bound_at = now
                row.current_team_id = team_id
                row.current_team_assigned_at = now
                db.add(row)
                if first_bind:
                    users_repo.add_refresh_history(
                        row,
                        event_type=models.CodeRefreshEventType.bind,
                        delta_refresh=0,
                        triggered_by=email,
                        metadata={"team_id": team_id},
                    )
                db.commit()
            return ok, msg, invite_id, mother_id, team_id
        else:
            # Rollback on failure
            if row:
                row.status = models.CodeStatus.unused
                db.add(row)
                db.commit()
            return ok, msg, invite_id, mother_id, team_id
    except Exception:
        # Rollback and return generic error
        try:
            if row:
                row.status = models.CodeStatus.unused
                db.add(row)
                db.commit()
        except Exception:
            db.rollback()
        return False, "\u5151\u6362\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5", None, None, None
    finally:
        if pool_session is not None:
            try:
                pool_session.close()
            except Exception:
                pass
