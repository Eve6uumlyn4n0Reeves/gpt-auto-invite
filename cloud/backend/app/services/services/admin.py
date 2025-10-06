from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
from app import models
from app.security import encrypt_token
from app.config import settings

def create_or_update_admin_default(db: Session, password_hash: str):
    row = db.query(models.AdminConfig).first()
    if not row:
        row = models.AdminConfig(password_hash=password_hash)
        db.add(row)
        db.commit()
    return row

def create_mother(
    db: Session,
    name: str,
    access_token: str,
    token_expires_at: datetime | None,
    teams: List[dict],
    notes: str | None,
):
    mtokens = encrypt_token(access_token)
    # 回退：若未提供过期时间，按配置默认 +N 天
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None
    mother = models.MotherAccount(
        name=name,
        access_token_enc=mtokens,
        token_expires_at=token_expires_at,
        status=models.MotherStatus.active,
        notes=notes,
    )
    db.add(mother)
    db.flush()
    
    # Ensure at most one default team
    default_set = False
    for t in teams:
        is_def = bool(t.get("is_default", False)) and not default_set
        if is_def:
            default_set = True
        db.add(
            models.MotherTeam(
                mother_id=mother.id,
                team_id=t.get("team_id"),
                team_name=t.get("team_name"),
                is_enabled=bool(t.get("is_enabled", True)),
                is_default=is_def,
            )
        )
    
    db.commit()
    db.refresh(mother)
    
    # Initialize 7 fixed slots (free)
    for idx in range(1, mother.seat_limit + 1):
        db.add(
            models.SeatAllocation(
                mother_id=mother.id,
                slot_index=idx,
                status=models.SeatStatus.free,
            )
        )
    
    db.commit()
    return mother

def compute_mother_seats_used(db: Session, mother_id: int) -> int:
    return db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

def list_mothers_with_usage(db: Session) -> list[dict]:
    mothers = db.query(models.MotherAccount).all()
    out = []
    for m in mothers:
        used = compute_mother_seats_used(db, m.id)
        out.append(
            {
                "id": m.id,
                "name": m.name,
                "status": m.status.value,
                "seat_limit": m.seat_limit,
                "seats_used": used,
                "token_expires_at": m.token_expires_at,
                "notes": m.notes,
                "teams": [
                    {
                        "team_id": t.team_id,
                        "team_name": t.team_name,
                        "is_enabled": t.is_enabled,
                        "is_default": t.is_default,
                    }
                    for t in m.teams
                ],
            }
        )
    return out
