import hashlib
import os
from typing import Tuple
from sqlalchemy.orm import Session
from datetime import datetime
from app import models
from app.services.invites import InviteService

def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()

def generate_codes(db: Session, count: int, prefix: str | None, expires_at: datetime | None, batch_id: str | None) -> Tuple[str, list[str]]:
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

def redeem_code(db: Session, code: str, email: str) -> tuple[bool, str, int | None, int | None, str | None]:
    h = hash_code(code)
    row = db.query(models.RedeemCode).filter(models.RedeemCode.code_hash == h).first()
    
    if not row:
        return False, "兑换码无效", None, None, None
    
    if row.status != models.CodeStatus.unused:
        return False, "兑换码已使用或不可用", None, None, None
    
    if row.expires_at and row.expires_at < datetime.utcnow():
        return False, "兑换码已过期", None, None, None
    
    # Delegate to invite service
    svc = InviteService(db)
    ok, msg, invite_id, mother_id, team_id = svc.invite_email(email, row)
    return ok, msg, invite_id, mother_id, team_id

