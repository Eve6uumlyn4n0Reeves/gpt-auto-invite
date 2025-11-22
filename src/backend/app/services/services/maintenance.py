from datetime import datetime, timedelta
from typing import Optional, Sequence

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, provider
from app.config import settings
from app.metrics_prom import CONTENT_TYPE_LATEST  # noqa: F401 (ensure module init)
try:
    from app.metrics_prom import Counter
except Exception:
    Counter = None

from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository
from app.security import decrypt_token
from app.services.services.switch import SwitchService


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

    def __init__(self, users_repo: UsersRepository, mother_repo: MotherRepository):
        self.users_repo = users_repo
        self.mother_repo = mother_repo
        self.users_session = users_repo.session
        self.pool_session = mother_repo.session
        self.switch_service = SwitchService(users_repo, mother_repo)
        self.invite_service = self.switch_service.invite_service

    # ------------------------------------------------------------------ #
    # Helpers
    def _commit_pool(self) -> None:
        try:
            self.mother_repo.commit()
        except Exception:
            self.mother_repo.rollback()
            raise

    def _commit_users(self) -> None:
        try:
            self.users_repo.commit()
        except Exception:
            self.users_repo.rollback()
            raise

    def _commit_both(self) -> None:
        try:
            self.mother_repo.commit()
            self.users_repo.commit()
        except Exception:
            self.mother_repo.rollback()
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

    def _remove_seat_for_code(self, code: models.RedeemCode) -> int:
        email = (code.used_by_email or "").strip().lower()
        team_id = code.used_by_team_id
        if not email or not team_id:
            return 0
        seat = (
            self.pool_session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.email == email)
            .filter(models.SeatAllocation.team_id == team_id)
            .first()
        )
        if not seat:
            return 0
        mother = self.mother_repo.get(seat.mother_id) if seat.mother_id else None
        if mother and mother.status == models.MotherStatus.active:
            ok, _ = self.invite_service.remove_member(email, team_id)
            return 1 if ok else 0

        seat.status = models.SeatStatus.free
        seat.held_until = None
        seat.team_id = None
        seat.email = None
        seat.invite_request_id = None
        seat.invite_id = None
        seat.member_id = None
        self.pool_session.add(seat)
        return 1

    def _expire_pending_requests(self, code_id: int) -> None:
        requests = (
            self.users_session.query(models.SwitchRequest)
            .filter(
                models.SwitchRequest.redeem_code_id == code_id,
                models.SwitchRequest.status == models.SwitchRequestStatus.pending,
            )
            .all()
        )
        if not requests:
            return
        now = datetime.utcnow()
        for request in requests:
            request.status = models.SwitchRequestStatus.expired
            request.last_error = "兑换码已过期"
            request.updated_at = now
            self.users_session.add(request)
        try:
            self.users_repo.commit()
        except Exception:
            self.users_repo.rollback()
            raise

    def _grant_refresh_for_team_ids(self, team_ids: Sequence[str]) -> int:
        if not team_ids:
            return 0
        codes = (
            self.users_session.query(models.RedeemCode)
            .filter(
                or_(
                    models.RedeemCode.used_by_team_id.in_(team_ids),  # type: ignore[arg-type]
                    models.RedeemCode.current_team_id.in_(team_ids),  # type: ignore[arg-type]
                )
            )
            .all()
        )
        if not codes:
            return 0
        granted = 0
        for code in codes:
            team_id = code.used_by_team_id or code.current_team_id
            if code.refresh_limit is not None:
                code.refresh_limit = (code.refresh_limit or 0) + 1
            self.users_repo.add_refresh_history(
                code,
                event_type=models.CodeRefreshEventType.health_bonus,
                delta_refresh=1 if code.refresh_limit is not None else 0,
                triggered_by="system",
                metadata={"reason": "mother_dead", "team_id": team_id},
            )
            code.current_team_id = None
            code.used_by_team_id = None
            self.users_session.add(code)
            granted += 1
        if granted:
            try:
                self.users_repo.commit()
            except Exception:
                self.users_repo.rollback()
                raise
        return granted

    def check_mother_health(self, limit: int = 5) -> int:
        """定期探测母号是否仍可用，更新 last_health_check/last_seen_alive。"""
        now = datetime.utcnow()
        grace_minutes = max(1, settings.mother_health_alive_grace_minutes)
        threshold = now - timedelta(minutes=grace_minutes)
        mothers = (
            self.pool_session.query(models.MotherAccount)
            .filter(models.MotherAccount.status == models.MotherStatus.active)
            .filter(
                (models.MotherAccount.last_health_check_at == None)  # noqa: E711
                | (models.MotherAccount.last_health_check_at < threshold)
            )
            .order_by(models.MotherAccount.last_health_check_at.asc().nullsfirst())
            .limit(limit)
            .all()
        )
        if not mothers:
            return 0

        checked = 0
        for mother in mothers:
            checked += 1
            mother.last_health_check_at = now
            team = (
                self.pool_session.query(models.MotherTeam)
                .filter(
                    models.MotherTeam.mother_id == mother.id,
                    models.MotherTeam.is_enabled == True,  # noqa: E712
                )
                .order_by(models.MotherTeam.is_default.desc(), models.MotherTeam.created_at.asc())
                .first()
            )
            if not team or not team.team_id:
                mother.last_seen_alive_at = now
                self.pool_session.add(mother)
                continue
            try:
                access_token = decrypt_token(mother.access_token_enc)
                provider.list_members(access_token, team.team_id, limit=1)
                mother.last_seen_alive_at = now
            except provider.ProviderError as exc:
                if exc.status in (401, 403):
                    mother.status = models.MotherStatus.invalid
                    self.pool_session.add(mother)
                    self._commit_pool()
                    self._grant_refresh_for_team_ids([team.team_id])
                    continue
            except Exception:
                # 忽略网络波动，保持原状态
                pass
            self.pool_session.add(mother)

        self._commit_pool()
        return checked

        requests = (
            self.users_session.query(models.SwitchRequest)
            .filter(models.SwitchRequest.redeem_code_id == code_id)
            .filter(models.SwitchRequest.status == models.SwitchRequestStatus.pending)
            .all()
        )
        if not requests:
            return
        now = datetime.utcnow()
        for req in requests:
            req.status = models.SwitchRequestStatus.expired
            req.last_error = "兑换码已到期"
            req.updated_at = now
            self.users_session.add(req)

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
            teams = (
                self.pool_session.query(models.MotherTeam)
                .filter(models.MotherTeam.mother_id == mother.id)
                .all()
            )
            team_ids = [team.team_id for team in teams if team.team_id]
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
            if team_ids:
                self._grant_refresh_for_team_ids(team_ids)

        if changed:
            self._commit_pool()
        return total_deleted_teams

    def cleanup_expired_codes(self, limit: int = 50) -> int:
        """Deactivate expired redeem codes并自动移除对应成员。"""
        now = datetime.utcnow()
        codes = (
            self.users_session.query(models.RedeemCode)
            .filter(models.RedeemCode.active == True)  # noqa: E712
            .filter(models.RedeemCode.lifecycle_expires_at != None)  # noqa: E711
            .filter(models.RedeemCode.lifecycle_expires_at <= now)
            .order_by(models.RedeemCode.lifecycle_expires_at.asc())
            .limit(limit)
            .all()
        )
        if not codes:
            return 0

        processed = 0
        for code in codes:
            removed = self._remove_seat_for_code(code)
            if removed:
                processed += 1
            code.active = False
            code.used_by_team_id = None
            self.users_session.add(code)
            self._expire_pending_requests(code.id)
        self._commit_both()
        return processed

    def process_switch_queue(self, limit: int = 20) -> int:
        """尝试处理待切换排队任务。"""
        now = datetime.utcnow()
        expired = (
            self.users_session.query(models.SwitchRequest)
            .filter(models.SwitchRequest.status == models.SwitchRequestStatus.pending)
            .filter(models.SwitchRequest.expires_at <= now)
            .all()
        )
        for req in expired:
            req.status = models.SwitchRequestStatus.expired
            req.last_error = "排队已过期"
            req.updated_at = now
            self.users_session.add(req)
        if expired:
            try:
                self.users_repo.commit()
            except Exception:
                self.users_repo.rollback()

        requests = (
            self.users_session.query(models.SwitchRequest)
            .filter(models.SwitchRequest.status == models.SwitchRequestStatus.pending)
            .filter(models.SwitchRequest.expires_at > now)
            .order_by(models.SwitchRequest.queued_at.asc())
            .limit(limit)
            .all()
        )
        if not requests:
            return 0

        processed = 0
        for req in requests:
            try:
                self.switch_service.process_request(req)
                processed += 1
            except Exception as exc:  # pylint: disable=broad-except
                req.status = models.SwitchRequestStatus.failed
                req.last_error = str(exc)
                req.updated_at = datetime.utcnow()
                self.users_session.add(req)
                try:
                    self.users_repo.commit()
                except Exception:
                    self.users_repo.rollback()
        return processed

    def sync_invite_acceptance(self, *, days: int = 30, limit_groups: int = 20) -> int:
        """同步邀请接受状态：将已加入团队的用户标记为 accepted，并回填 member_id。"""
        from sqlalchemy import func

        now = datetime.utcnow()
        since = now.replace(microsecond=0) - timedelta(days=days)

        q = (
            self.users_session.query(
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
            .group_by(models.InviteRequest.team_id)
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
        for team_id, _ in groups:
            if not team_id:
                continue

            # 根据team_id查找对应的mother和seat
            mother_teams = (
                self.pool_session.query(models.MotherAccount, models.MotherTeam)
                .join(models.MotherTeam, models.MotherAccount.id == models.MotherTeam.mother_id)
                .filter(
                    models.MotherTeam.team_id == team_id,
                    models.MotherTeam.is_enabled == True,
                    models.MotherAccount.status == models.MotherStatus.active,
                )
                .all()
            )

            if not mother_teams:
                continue

            for mother, team in mother_teams:
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
                            models.SeatAllocation.mother_id == mother.id,
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
    return MaintenanceService(UsersRepository(users_session), MotherRepository(pool_session))
