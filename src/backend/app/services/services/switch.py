from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import func

from app import models
from app.config import settings
from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository
from app.services.services.invites import InviteService
from app.services.services.redeem import hash_code


NO_SLOT_MESSAGE = "暂无可用座位"


@dataclass
class SwitchResult:
    success: bool
    message: str
    queued: bool = False
    request: Optional[models.SwitchRequest] = None
    mother_id: Optional[int] = None
    team_id: Optional[str] = None


class SwitchService:
    """Handles mailbox seat switching backed by redeem codes."""

    def __init__(self, users_repo: UsersRepository, mother_repo: MotherRepository):
        self.users_repo = users_repo
        self.mother_repo = mother_repo
        self.users_session = users_repo.session
        self.pool_session = mother_repo.session
        self.invite_service = InviteService(users_repo, mother_repo)

    # Public API ------------------------------------------------------
    def switch_email(
        self,
        email: str,
        code_plain: Optional[str] = None,
        *,
        allow_queue: bool = True,
        code_row: Optional[models.RedeemCode] = None,
        prefer_recent_team: bool = False,
        recent_window_days: Optional[int] = None,
    ) -> SwitchResult:
        normalized_email = email.lower().strip()
        code = code_row or self._load_code(normalized_email, code_plain)
        if not code:
            return SwitchResult(False, "未找到匹配的兑换码")

        now = datetime.utcnow()
        if code.lifecycle_expires_at and code.lifecycle_expires_at < now:
            code.active = False
            self.users_session.add(code)
            self.users_repo.commit()
            return SwitchResult(False, "兑换码生命周期已到期")

        if code.active is False:
            return SwitchResult(False, "兑换码已被停用")

        limit = code.switch_limit or 0
        if limit and (code.switch_count or 0) >= limit:
            return SwitchResult(False, "可用切换次数已用尽")

        seat, prev_mother_id = self._locate_active_seat(normalized_email, code)
        remove_ok, remove_msg = self._detach_previous_membership(normalized_email, seat)
        if not remove_ok:
            return SwitchResult(False, remove_msg or "移除旧团队失败")

        ok, msg, _, new_mother_id, new_team_id = self.invite_service.invite_email(
            normalized_email,
            code,
            prefer_recent_team=prefer_recent_team,
            recent_window_days=recent_window_days,
        )
        if ok:
            self._mark_successful_switch(code, new_team_id)
            self._close_pending_requests(code.id, normalized_email, new_mother_id)
            return SwitchResult(True, "切换成功", mother_id=new_mother_id, team_id=new_team_id)

        needs_queue = NO_SLOT_MESSAGE in (msg or "")
        if not needs_queue or not allow_queue:
            return SwitchResult(False, msg or "切换失败", queued=needs_queue)

        request = self._enqueue_switch_request(code, normalized_email, prev_mother_id, msg or NO_SLOT_MESSAGE)
        return SwitchResult(False, "暂无可用座位，已加入排队", queued=True, request=request)

    def process_request(self, request: models.SwitchRequest) -> SwitchResult:
        code = self.users_session.get(models.RedeemCode, request.redeem_code_id)
        if not code:
            request.status = models.SwitchRequestStatus.failed
            request.last_error = "兑换码不存在"
            self.users_session.add(request)
            self.users_repo.commit()
            return SwitchResult(False, "兑换码不存在")

        if request.expires_at and request.expires_at < datetime.utcnow():
            request.status = models.SwitchRequestStatus.expired
            request.last_error = "排队已过期"
            self.users_session.add(request)
            self.users_repo.commit()
            return SwitchResult(False, "排队已过期")

        result = self.switch_email(request.email, code_row=code, allow_queue=False)
        request.attempts = (request.attempts or 0) + 1
        request.updated_at = datetime.utcnow()

        if result.success:
            request.status = models.SwitchRequestStatus.succeeded
            request.last_error = None
            request.mother_id_next = result.mother_id
        elif result.queued:
            request.status = models.SwitchRequestStatus.pending
            request.reason = request.reason or "no_capacity"
            request.last_error = result.message
            request.queued_at = datetime.utcnow()
        else:
            request.status = models.SwitchRequestStatus.failed
            request.last_error = result.message

        self.users_session.add(request)
        self.users_repo.commit()
        return result

    # Internal helpers ------------------------------------------------
    def _load_code(self, email: str, code_plain: Optional[str]) -> Optional[models.RedeemCode]:
        query = self.users_session.query(models.RedeemCode)
        if code_plain:
            code_value = code_plain.strip().upper()
            code_hash = hash_code(code_value)
            query = query.filter(models.RedeemCode.code_hash == code_hash)
        else:
            query = query.filter(func.lower(models.RedeemCode.used_by_email) == email.lower())
        query = query.filter(models.RedeemCode.status == models.CodeStatus.used)
        query = query.filter(models.RedeemCode.active == True)  # noqa: E712
        query = query.order_by(
            models.RedeemCode.lifecycle_expires_at.asc().nullslast(),
            models.RedeemCode.created_at.asc(),
        )
        code = query.first()
        if code and code.used_by_email and code.used_by_email.lower() != email.lower():
            return None
        return code

    def _locate_active_seat(
        self, email: str, code: models.RedeemCode
    ) -> Tuple[Optional[models.SeatAllocation], Optional[int]]:
        query = (
            self.pool_session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.email == email)
            .filter(models.SeatAllocation.status == models.SeatStatus.used)
        )
        if code.used_by_team_id:
            query = query.filter(models.SeatAllocation.team_id == code.used_by_team_id)
        seat = query.order_by(models.SeatAllocation.updated_at.desc()).first()
        prev_mother_id = seat.mother_id if seat else None
        return seat, prev_mother_id

    def _detach_previous_membership(
        self, email: str, seat: Optional[models.SeatAllocation]
    ) -> Tuple[bool, Optional[str]]:
        if not seat or not seat.team_id:
            return True, None
        mother = self.mother_repo.get(seat.mother_id) if seat.mother_id else None
        if mother and mother.status == models.MotherStatus.active:
            return self.invite_service.remove_member(email, seat.team_id)

        # 母号已失效，直接释放本地席位
        seat.status = models.SeatStatus.free
        seat.held_until = None
        seat.team_id = None
        seat.email = None
        seat.invite_request_id = None
        seat.invite_id = None
        seat.member_id = None
        self.pool_session.add(seat)
        try:
            self.mother_repo.commit()
        except Exception:
            self.mother_repo.rollback()
            return False, "释放旧席位失败"
        return True, None

    def _mark_successful_switch(self, code: models.RedeemCode, team_id: Optional[str]) -> None:
        now = datetime.utcnow()
        if isinstance(code.lifecycle_plan, models.RedeemCodeLifecycle):
            plan_value = code.lifecycle_plan.value
        elif isinstance(code.lifecycle_plan, str) and code.lifecycle_plan:
            plan_value = code.lifecycle_plan.lower()
        else:
            plan_value = settings.resolve_lifecycle_plan(None)
            code.lifecycle_plan = models.RedeemCodeLifecycle(plan_value)
        if code.lifecycle_started_at is None:
            code.lifecycle_started_at = now
            code.lifecycle_expires_at = now + timedelta(days=settings.lifecycle_duration_days(plan_value))

        code.switch_count = (code.switch_count or 0) + 1
        code.last_switch_at = now
        code.used_by_team_id = team_id
        code.active = True
        self.users_session.add(code)
        try:
            self.users_repo.commit()
        except Exception:
            self.users_repo.rollback()
            raise

    def _enqueue_switch_request(
        self,
        code: models.RedeemCode,
        email: str,
        mother_id_prev: Optional[int],
        last_error: str,
    ) -> models.SwitchRequest:
        expires_at = code.lifecycle_expires_at
        if not expires_at:
            plan = (
                code.lifecycle_plan.value
                if isinstance(code.lifecycle_plan, models.RedeemCodeLifecycle)
                else settings.resolve_lifecycle_plan(None)
            )
            expires_at = datetime.utcnow() + timedelta(days=settings.lifecycle_duration_days(plan))

        request = self.users_repo.get_pending_switch_request(code.id, email)
        now = datetime.utcnow()
        if request:
            request.reason = "no_capacity"
            request.last_error = last_error
            request.queued_at = now
            request.expires_at = expires_at
            request.mother_id_prev = mother_id_prev
        else:
            request = models.SwitchRequest(
                redeem_code_id=code.id,
                email=email,
                status=models.SwitchRequestStatus.pending,
                reason="no_capacity",
                attempts=0,
                queued_at=now,
                expires_at=expires_at,
                last_error=last_error,
                mother_id_prev=mother_id_prev,
            )
        self.users_session.add(request)
        self.users_repo.commit()
        return request

    def _close_pending_requests(self, code_id: int, email: str, mother_id_next: Optional[int]) -> None:
        request = self.users_repo.get_pending_switch_request(code_id, email)
        if not request:
            return
        request.status = models.SwitchRequestStatus.succeeded
        request.last_error = None
        request.mother_id_next = mother_id_next
        request.updated_at = datetime.utcnow()
        self.users_session.add(request)
        self.users_repo.commit()

