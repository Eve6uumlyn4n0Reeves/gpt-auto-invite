from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.repositories import UsersRepository


@dataclass(frozen=True)
class CapacitySnapshot:
    total_slots: int
    alive_mothers: int
    reserved_codes: int
    available_slots: int
    warn: bool

    def to_dict(self) -> dict[str, int | bool]:
        return {
            "total_slots": self.total_slots,
            "alive_mothers": self.alive_mothers,
            "reserved_codes": self.reserved_codes,
            "available_slots": self.available_slots,
            "warn": self.warn,
        }


class CapacityGuardError(RuntimeError):
    """Raised when capacity is insufficient."""


class CapacityGuard:
    """Cross-domain guard ensuring redeem codes never exceed theoretical seat capacity."""

    def __init__(
        self,
        users_session: Session,
        pool_session: Session,
        *,
        warn_threshold: Optional[int] = None,
    ) -> None:
        self.users_session = users_session
        self.pool_session = pool_session
        self.warn_threshold = warn_threshold or max(0, settings.capacity_warn_threshold)
        self._users_repo = UsersRepository(users_session)

    def snapshot(self) -> CapacitySnapshot:
        now = datetime.utcnow()
        total_slots, alive_mothers = self._compute_total_slots(now)
        reserved_codes = self._users_repo.count_active_redeem_codes()
        available_slots = max(total_slots - reserved_codes, 0)
        warn = available_slots <= self.warn_threshold
        return CapacitySnapshot(
            total_slots=total_slots,
            alive_mothers=alive_mothers,
            reserved_codes=reserved_codes,
            available_slots=available_slots,
            warn=warn,
        )

    def ensure_capacity(self, required_slots: int) -> CapacitySnapshot:
        snapshot = self.snapshot()
        if required_slots > snapshot.available_slots:
            raise CapacityGuardError(
                f"当前号池仅剩 {snapshot.available_slots} 个空位，不足以支撑本次 {required_slots} 个兑换码"
            )
        return snapshot

    def _compute_total_slots(self, now: datetime) -> tuple[int, int]:
        grace_minutes = max(0, settings.mother_health_alive_grace_minutes)
        threshold = now - timedelta(minutes=grace_minutes) if grace_minutes else None
        query = (
            self.pool_session.query(
                func.coalesce(func.sum(models.MotherAccount.seat_limit), 0),
                func.count(models.MotherAccount.id),
            )
            .filter(models.MotherAccount.status == models.MotherStatus.active)
        )
        if threshold:
            query = query.filter(
                (models.MotherAccount.last_seen_alive_at == None)  # noqa: E711
                | (models.MotherAccount.last_seen_alive_at >= threshold)
            )
        total_slots, alive_mothers = query.first() or (0, 0)
        return int(total_slots or 0), int(alive_mothers or 0)

