import hashlib
import os
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import update, select
from datetime import datetime
from app import models
from app.services.services.invites import InviteService
from app.repositories import PoolRepository, UsersRepository


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_codes(
    db: Session,
    count: int,
    prefix: Optional[str],
    expires_at: Optional[datetime],
    batch_id: Optional[str],
) -> Tuple[str, list[str]]:
    batch = batch_id or datetime.utcnow().strftime("%Y%m%d%H%M%S")
    codes: list[str] = []

    for _ in range(count):
        rand = base36(os.urandom(16))
        code = f"{prefix}{rand}" if prefix else rand
        codes.append(code)
        db.add(models.RedeemCode(code_hash=hash_code(code), batch_id=batch, expires_at=expires_at))

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

    # Invite
    try:
        users_repo = UsersRepository(db)
        pool_repo = PoolRepository(db)
        svc = InviteService(users_repo, pool_repo)
        ok, msg, invite_id, mother_id, team_id = svc.invite_email(email, row)

        # Redundant safeguard for success
        if ok:
            if row:
                row.status = models.CodeStatus.used
                row.used_by_email = email
                row.used_by_mother_id = mother_id
                row.used_by_team_id = team_id
                row.used_at = datetime.utcnow()
                db.add(row)
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
