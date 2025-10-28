"""
Data access helpers bound to the Pool database.

The repository acts as the single entry point for reading / writing
Pool-domain entities (mother accounts, teams, seats, pool groups, etc.).
It intentionally requires an explicit SQLAlchemy Session that is
already configured against the Pool engine.
"""

from __future__ import annotations

from typing import Iterable, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models


class PoolRepository:
    """Lightweight repository wrapper around a Pool Session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    # Mother accounts -------------------------------------------------
    def get_mother(self, mother_id: int) -> Optional[models.MotherAccount]:
        return self._session.get(models.MotherAccount, mother_id)

    def get_mothers_by_ids(
        self,
        mother_ids: Sequence[int],
        *,
        include_inactive: bool = True,
    ) -> list[models.MotherAccount]:
        if not mother_ids:
            return []
        query = self._session.query(models.MotherAccount).filter(
            models.MotherAccount.id.in_(mother_ids)
        )
        if not include_inactive:
            query = query.filter(models.MotherAccount.status == models.MotherStatus.active)
        return query.all()

    def list_mothers(
        self,
        *,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[models.MotherAccount], int]:
        query = self._session.query(models.MotherAccount)
        if search:
            like = f"%{search.lower()}%"
            query = query.filter(func.lower(models.MotherAccount.name).like(like))
        total = query.count()
        if total == 0:
            return [], 0
        page = max(1, page)
        page_size = max(1, page_size)
        offset = (page - 1) * page_size
        rows = (
            query.order_by(models.MotherAccount.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
        return rows, total

    # Teams -----------------------------------------------------------
    def list_mother_teams(self, mother_id: int) -> list[models.MotherTeam]:
        return (
            self._session.query(models.MotherTeam)
            .filter(models.MotherTeam.mother_id == mother_id)
            .order_by(
                models.MotherTeam.is_default.desc(),
                models.MotherTeam.team_id.asc(),
            )
            .all()
        )

    def get_enabled_teams(self, mother_id: int) -> list[models.MotherTeam]:
        return (
            self._session.query(models.MotherTeam)
            .filter(
                models.MotherTeam.mother_id == mother_id,
                models.MotherTeam.is_enabled.is_(True),
            )
            .all()
        )

    # Seats -----------------------------------------------------------
    def list_seats(self, mother_id: int) -> list[models.SeatAllocation]:
        return (
            self._session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.mother_id == mother_id)
            .order_by(models.SeatAllocation.slot_index.asc())
            .all()
        )

    def get_available_seat(self, mother_id: int) -> Optional[models.SeatAllocation]:
        return (
            self._session.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.mother_id == mother_id,
                models.SeatAllocation.status == models.SeatStatus.free,
            )
            .order_by(models.SeatAllocation.slot_index.asc())
            .first()
        )

    def get_seats_for_email(self, team_id: str, email: str) -> list[models.SeatAllocation]:
        return (
            self._session.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.team_id == team_id,
                models.SeatAllocation.email == email,
            )
            .all()
        )

    def bulk_add(self, entities: Iterable[object]) -> None:
        for entity in entities:
            self._session.add(entity)

    def flush(self) -> None:
        self._session.flush()

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()
