from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.shared.capacity_guard import CapacityGuard
from app.config import settings


@dataclass(frozen=True)
class QuotaSnapshot:
    total_codes: int
    used_codes: int
    active_codes: int
    max_code_capacity: int
    remaining_quota: int
    used_seats: int
    pending_invites: int
    generated_at: str
    alive_mothers: int
    capacity_warn: bool

    def to_dict(self) -> Dict[str, int | str]:
        return {
            "total_codes": self.total_codes,
            "used_codes": self.used_codes,
            "active_codes": self.active_codes,
            "max_code_capacity": self.max_code_capacity,
            "remaining_quota": self.remaining_quota,
            "used_seats": self.used_seats,
            "pending_invites": self.pending_invites,
            "generated_at": self.generated_at,
            "alive_mothers": self.alive_mothers,
            "capacity_warn": self.capacity_warn,
        }


class QuotaService:
    """
    统一的配额口径：
    - active_codes: 未过期且未使用的兑换码
    - max_code_capacity: 活跃且有启用团队的母号所有 free 席位数
    - remaining_quota: max(0, max_code_capacity - active_codes)
    """

    @staticmethod
    def count_active_codes(users_db: Session, now: datetime | None = None) -> int:
        now = now or datetime.utcnow()
        return (
            users_db.query(models.RedeemCode)
            .filter(
                models.RedeemCode.status == models.CodeStatus.unused,
                ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
            )
            .count()
        )

    @staticmethod
    def count_used_codes(users_db: Session) -> int:
        return users_db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()

    @staticmethod
    def count_total_codes(users_db: Session) -> int:
        return users_db.query(models.RedeemCode).count()

    @staticmethod
    def count_free_seats(pool_db: Session) -> int:
        """Theoretical capacity = sum of seat_limit for alive mothers."""
        grace_minutes = max(0, settings.mother_health_alive_grace_minutes)
        threshold = datetime.utcnow() - timedelta(minutes=grace_minutes) if grace_minutes else None
        query = pool_db.query(func.coalesce(func.sum(models.MotherAccount.seat_limit), 0)).filter(
            models.MotherAccount.status == models.MotherStatus.active
        )
        if threshold:
            query = query.filter(
                (models.MotherAccount.last_seen_alive_at == None)  # noqa: E711
                | (models.MotherAccount.last_seen_alive_at >= threshold)
            )
        return int(query.scalar() or 0)

    @staticmethod
    def count_used_seats(pool_db: Session) -> int:
        return (
            pool_db.query(models.SeatAllocation)
            .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
            .count()
        )

    @staticmethod
    def count_pending_invites(users_db: Session) -> int:
        return (
            users_db.query(models.InviteRequest)
            .filter(models.InviteRequest.status == models.InviteStatus.pending)
            .count()
        )

    @classmethod
    def get_quota_snapshot(cls, users_db: Session, pool_db: Session) -> QuotaSnapshot:
        now = datetime.utcnow()
        total_codes = cls.count_total_codes(users_db)
        used_codes = cls.count_used_codes(users_db)
        guard = CapacityGuard(users_db, pool_db)
        capacity = guard.snapshot()
        active_codes = capacity.reserved_codes
        free_seats = capacity.total_slots
        used_seats = cls.count_used_seats(pool_db)
        pending_invites = cls.count_pending_invites(users_db)
        remaining_quota = max(0, capacity.available_slots)
        return QuotaSnapshot(
            total_codes=total_codes,
            used_codes=used_codes,
            active_codes=active_codes,
            max_code_capacity=free_seats,
            remaining_quota=remaining_quota,
            used_seats=used_seats,
            pending_invites=pending_invites,
            generated_at=now.isoformat(),
            alive_mothers=capacity.alive_mothers,
            capacity_warn=capacity.warn,
        )

