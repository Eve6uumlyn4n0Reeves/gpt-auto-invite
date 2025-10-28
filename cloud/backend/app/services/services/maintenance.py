from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app import models, provider
from app.metrics_prom import CONTENT_TYPE_LATEST  # noqa: F401 (ensure module init)
try:
    from app.metrics_prom import Counter
except Exception:
    Counter = None

from app.repositories import PoolRepository, UsersRepository
from app.security import decrypt_token


if Counter:
    invite_accept_updates_total = Counter(
        "invite_accept_updates_total",
        "Total invites marked as accepted by sync task",
    )


def _find_member_id_by_email(payload: object, email: str):
    target = (email or "").lower()
    stack = [payload]
    seen: set[int] = set()
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            ident = id(cur)
            if ident in seen:
                continue
            seen.add(ident)
            cand = cur.get("email") or cur.get("email_address")
            if not cand:
                u = cur.get("user") or cur.get("member") or cur.get("account")
                if isinstance(u, dict):
                    cand = u.get("email") or u.get("email_address")
            if isinstance(cand, str) and cand.lower() == target:
                for k in ("id", "member_id", "user_id", "account_user_id"):
                    v = cur.get(k)
                    if v:
                        return str(v)
            for v in cur.values():
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            for it in cur:
                if isinstance(it, (dict, list)):
                    stack.append(it)
    return None


class MaintenanceService:
    """Encapsulates maintenance operations across Users/Pool databases."""

    def __init__(self, users_repo: UsersRepository, pool_repo: PoolRepository):
        self.users_repo = users_repo
        self.pool_repo = pool_repo
        self.users_session = users_repo.session
        self.pool_session = pool_repo.session

    # ------------------------------------------------------------------ #
    # Helpers
    def _commit_pool(self) -> None:
        try:
            self.pool_repo.commit()
        except Exception:
            self.pool_repo.rollback()
            raise

    def _commit_users(self) -> None:
        try:
            self.users_repo.commit()
        except Exception:
            self.users_repo.rollback()
            raise

    def _commit_both(self) -> None:
        try:
            self.pool_repo.commit()
            self.users_repo.commit()
        except Exception:
            self.pool_repo.rollback()
            self.users_repo.rollback()
            raise

    def _mark_mother_invalid(self, mother: Optional[models.MotherAccount]) -> None:
        if not mother:
            return
        mother.status = models.MotherStatus.invalid
        self.pool_session.add(mother)
        try:
            self._commit_pool()
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    # Public methods
    def cleanup_stale_held(self) -> int:
        now = datetime.utcnow()
        rows = (
            self.pool_session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.status == models.SeatStatus.held)
            .filter(models.SeatAllocation.held_until != None)  # noqa: E711
            .filter(models.SeatAllocation.held_until < now)
            .all()
        )

        count = 0
        for seat in rows:
            seat.status = models.SeatStatus.free
            seat.held_until = None
            seat.team_id = None
            seat.email = None
            seat.invite_request_id = None
            seat.invite_id = None
            count += 1
            self.pool_session.add(seat)

        if count:
            self._commit_pool()
        return count

    def cleanup_expired_mother_teams(self) -> int:
        """删除已过期母号的团队，并清理其席位。"""
        now = datetime.utcnow()
        mothers = (
            self.pool_session.query(models.MotherAccount)
            .filter(models.MotherAccount.token_expires_at != None)  # noqa: E711
            .filter(models.MotherAccount.token_expires_at < now)
            .all()
        )

        total_deleted_teams = 0
        changed = False
        if not mothers:
            return 0

        for mother in mothers:
            seats = (
                self.pool_session.query(models.SeatAllocation)
                .filter(models.SeatAllocation.mother_id == mother.id)
                .all()
            )
            for seat in seats:
                seat.status = models.SeatStatus.free
                seat.held_until = None
                seat.team_id = None
                seat.email = None
                seat.invite_request_id = None
                seat.invite_id = None
                seat.member_id = None
                self.pool_session.add(seat)
                changed = True

            deleted = (
                self.pool_session.query(models.MotherTeam)
                .filter(models.MotherTeam.mother_id == mother.id)
                .delete()
            )
            total_deleted_teams += deleted
            mother.status = models.MotherStatus.invalid
            self.pool_session.add(mother)
            changed = True

        if changed:
            self._commit_pool()
        return total_deleted_teams

    def sync_invite_acceptance(self, *, days: int = 30, limit_groups: int = 20) -> int:
        """同步邀请接受状态：将已加入团队的用户标记为 accepted，并回填 member_id。"""
        from sqlalchemy import func

        now = datetime.utcnow()
        since = now.replace(microsecond=0) - timedelta(days=days)

        q = (
            self.users_session.query(
                models.InviteRequest.mother_id,
                models.InviteRequest.team_id,
                func.count(models.InviteRequest.id),
            )
            .filter(
                models.InviteRequest.status == models.InviteStatus.sent,
                func.coalesce(
                    models.InviteRequest.updated_at, models.InviteRequest.created_at
                )
                >= since,
            )
            .group_by(models.InviteRequest.mother_id, models.InviteRequest.team_id)
            .order_by(
                func.max(
                    func.coalesce(
                        models.InviteRequest.updated_at, models.InviteRequest.created_at
                    )
                ).desc()
            )
        )

        updated_total = 0
        groups = q.limit(limit_groups).all()
        for mother_id, team_id, _ in groups:
            if not mother_id or not team_id:
                continue
            mother = self.pool_session.get(models.MotherAccount, mother_id)
            if not mother or mother.status != models.MotherStatus.active:
                continue
            try:
                access_token = decrypt_token(mother.access_token_enc)
                payload = provider.list_members(access_token, team_id)
            except provider.ProviderError as e:
                if e.status in (401, 403):
                    self._mark_mother_invalid(mother)
                continue
            except Exception:
                continue

            invites = (
                self.users_session.query(models.InviteRequest)
                .filter(
                    models.InviteRequest.mother_id == mother_id,
                    models.InviteRequest.team_id == team_id,
                    models.InviteRequest.status == models.InviteStatus.sent,
                )
                .all()
            )

            updated_in_group = 0
            for inv in invites:
                member_id = _find_member_id_by_email(payload, inv.email)
                if not member_id:
                    continue
                seat = (
                    self.pool_session.query(models.SeatAllocation)
                    .filter(
                        models.SeatAllocation.mother_id == mother_id,
                        models.SeatAllocation.team_id == team_id,
                        models.SeatAllocation.email == inv.email,
                    )
                    .first()
                )
                if seat:
                    seat.member_id = member_id
                    self.pool_session.add(seat)
                inv.member_id = member_id
                inv.status = models.InviteStatus.accepted
                self.users_session.add(inv)
                updated_in_group += 1

            if updated_in_group:
                updated_total += updated_in_group
                self._commit_both()
                if Counter:
                    try:
                        invite_accept_updates_total.inc(updated_in_group)
                    except Exception:
                        pass

        return updated_total


def create_maintenance_service(users_session: Session, pool_session: Session) -> MaintenanceService:
    return MaintenanceService(UsersRepository(users_session), PoolRepository(pool_session))
