from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

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
    token_expires_at: Optional[datetime],
    teams: List[dict],
    notes: Optional[str],
):
    """
    创建母号及其团队、座位数据，确保操作具备原子性。
    """
    mtokens = encrypt_token(access_token)
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None

    try:
        with db.begin():
            mother = models.MotherAccount(
                name=name,
                access_token_enc=mtokens,
                token_expires_at=token_expires_at,
                status=models.MotherStatus.active,
                notes=notes,
            )
            db.add(mother)
            db.flush()

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

            seat_limit = mother.seat_limit or 0
            for idx in range(1, seat_limit + 1):
                db.add(
                    models.SeatAllocation(
                        mother_id=mother.id,
                        slot_index=idx,
                        status=models.SeatStatus.free,
                    )
                )

        db.refresh(mother)
        return mother
    except Exception:
        db.rollback()
        raise

def compute_mother_seats_used(db: Session, mother_id: int) -> int:
    return db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

def list_mothers_with_usage(
    db: Session,
    *,
    page: int,
    page_size: int,
    search: Optional[str] = None,
) -> Tuple[list[dict], int, int, int]:
    query = db.query(models.MotherAccount)

    if search:
        like = f"%{search.lower()}%"
        query = query.filter(func.lower(models.MotherAccount.name).like(like))

    total = query.count()
    if total == 0:
        return [], 0, page, 0

    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = max(1, min(page, total_pages))
    offset = (current_page - 1) * page_size

    mothers = (
        query.order_by(models.MotherAccount.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    mother_ids = [m.id for m in mothers]
    seat_counts = {}
    teams_map: defaultdict[int, list[models.MotherTeam]] = defaultdict(list)

    if mother_ids:
        seat_counts = dict(
            db.query(models.SeatAllocation.mother_id, func.count())
            .filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
            )
            .group_by(models.SeatAllocation.mother_id)
            .all()
        )

        teams = (
            db.query(models.MotherTeam)
            .filter(models.MotherTeam.mother_id.in_(mother_ids))
            .order_by(
                models.MotherTeam.mother_id,
                models.MotherTeam.is_default.desc(),
                models.MotherTeam.team_id,
            )
            .all()
        )
        for team in teams:
            teams_map[team.mother_id].append(team)

    items = []
    for mother in mothers:
        used = seat_counts.get(mother.id, 0)
        items.append(
            {
                "id": mother.id,
                "name": mother.name,
                "status": mother.status.value,
                "seat_limit": mother.seat_limit,
                "seats_used": used,
                "token_expires_at": mother.token_expires_at.isoformat() if mother.token_expires_at else None,
                "notes": mother.notes,
                "teams": [
                    {
                        "team_id": team.team_id,
                        "team_name": team.team_name,
                        "is_enabled": team.is_enabled,
                        "is_default": team.is_default,
                    }
                    for team in teams_map.get(mother.id, [])
                ],
            }
        )

    return items, total, current_page, total_pages
