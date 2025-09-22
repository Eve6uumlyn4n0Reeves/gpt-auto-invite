from sqlalchemy.orm import Session
from sqlalchemy import update, select
from datetime import datetime, timedelta
from typing import Optional
from app import models
from app.security import decrypt_token
from app import provider
import time


class InviteService:
    def __init__(self, db: Session):
        self.db = db

    def _choose_target(self, email: str, exclude_mother_ids: Optional[set[int]] = None) -> Optional[tuple[models.MotherAccount, models.MotherTeam]]:
        # Prefer active mothers with least used seats
        mothers = (
            self.db.query(models.MotherAccount)
            .filter(models.MotherAccount.status == models.MotherStatus.active)
            .all()
        )
        candidates: list[tuple[models.MotherAccount, int]] = []
        for m in mothers:
            if exclude_mother_ids and m.id in exclude_mother_ids:
                continue
            used = (
                self.db.query(models.SeatAllocation)
                .filter(
                    models.SeatAllocation.mother_id == m.id,
                    models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
                )
                .count()
            )
            if used < m.seat_limit:
                candidates.append((m, used))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[1])

        for mother, _ in candidates:
            teams = [t for t in mother.teams if t.is_enabled]
            # Avoid teams where email already has a seat
            teams = [
                t
                for t in teams
                if not self.db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.team_id == t.team_id, models.SeatAllocation.email == email)
                .first()
            ]
            # Ensure mother has a free slot
            has_free = (
                self.db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.mother_id == mother.id, models.SeatAllocation.status == models.SeatStatus.free)
                .first()
            ) is not None
            if teams and has_free:
                default = next((t for t in teams if t.is_default), None)
                return mother, (default or teams[0])
        return None

    def invite_email(self, email: str, code_row: Optional[models.RedeemCode]) -> tuple[bool, str, Optional[int], Optional[int], Optional[str]]:
        tried_mothers: set[int] = set()
        switch_remaining = 1

        while True:
            choice = self._choose_target(email, exclude_mother_ids=tried_mothers)
            if not choice:
                return False, "暂无可用席位（所有母号已满或团队不可用）", None, None, None
            mother, team = choice
            tried_mothers.add(mother.id)
            access_token = decrypt_token(mother.access_token_enc)

            # If seat exists for (email, team), idempotent success
            exists = (
                self.db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.team_id == team.team_id, models.SeatAllocation.email == email)
                .first()
            )
            if exists:
                if code_row:
                    code_row.status = models.CodeStatus.used
                    code_row.used_by_email = email
                    code_row.used_by_mother_id = mother.id
                    code_row.used_by_team_id = team.team_id
                    code_row.used_at = datetime.utcnow()
                    self.db.add(code_row)
                    self.db.commit()
                return True, "已占用该团队席位", exists.invite_request_id, mother.id, team.team_id

            # Try to claim a free slot and mark held (30s TTL) atomically
            seat = None
            dialect = getattr(getattr(self.db, "bind", None), "dialect", None)
            is_pg = bool(dialect and getattr(dialect, "name", "").startswith("postgres"))
            held_until = datetime.utcnow() + timedelta(seconds=30)
            if is_pg:
                candidate = self.db.execute(
                    select(models.SeatAllocation)
                    .where(
                        models.SeatAllocation.mother_id == mother.id,
                        models.SeatAllocation.status == models.SeatStatus.free,
                    )
                    .order_by(models.SeatAllocation.slot_index.asc())
                    .with_for_update(skip_locked=True)
                ).scalars().first()
                if candidate:
                    seat = self.db.get(models.SeatAllocation, candidate.id)
                    seat.status = models.SeatStatus.held
                    seat.held_until = held_until
                    seat.team_id = team.team_id
                    seat.email = email
                    self.db.add(seat)
                    self.db.commit()
            else:
                claim_attempts = 3
                while claim_attempts > 0 and seat is None:
                    claim_attempts -= 1
                    candidate = (
                        self.db.query(models.SeatAllocation)
                        .filter(
                            models.SeatAllocation.mother_id == mother.id,
                            models.SeatAllocation.status == models.SeatStatus.free,
                        )
                        .order_by(models.SeatAllocation.slot_index.asc())
                        .first()
                    )
                    if not candidate:
                        break
                    res = self.db.execute(
                        update(models.SeatAllocation)
                        .where(
                            models.SeatAllocation.id == candidate.id,
                            models.SeatAllocation.status == models.SeatStatus.free,
                        )
                        .values(
                            status=models.SeatStatus.held,
                            held_until=held_until,
                            team_id=team.team_id,
                            email=email,
                        )
                    )
                    if res.rowcount == 1:
                        self.db.commit()
                        seat = self.db.get(models.SeatAllocation, candidate.id)
                        break
                    # else: contention, retry loop to pick next free seat
            if seat is None:
                if switch_remaining > 0:
                    switch_remaining -= 1
                    continue
                return False, "暂无可用席位（槽位占满）", None, mother.id, team.team_id

            # Create invite request after seat is held to avoid遗留 pending
            inv = models.InviteRequest(
                mother_id=mother.id,
                team_id=team.team_id,
                email=email,
                code_id=code_row.id if code_row else None,
                status=models.InviteStatus.pending,
                attempt_count=0,
                last_attempt_at=None,
            )
            self.db.add(inv)
            self.db.flush()
            seat.invite_request_id = inv.id
            self.db.add(seat)
            self.db.commit()

            max_retries = 3
            delay_sec = 1
            try:
                for i in range(max_retries + 1):
                    try:
                        inv.attempt_count += 1
                        inv.last_attempt_at = datetime.utcnow()
                        resp = provider.send_invite(access_token, team.team_id, email, "standard-user", True)
                        inv.status = models.InviteStatus.sent
                        invite_id = None
                        if isinstance(resp, dict):
                            invite_id = resp.get("id") or resp.get("invite_id")
                            arr = resp.get("invites") or resp.get("data")
                            if not invite_id and isinstance(arr, list) and arr:
                                first = arr[0]
                                if isinstance(first, dict):
                                    invite_id = first.get("id")
                        inv.invite_id = invite_id
                        # held -> used
                        seat.status = models.SeatStatus.used
                        seat.held_until = None
                        seat.invite_id = invite_id
                        if code_row:
                            code_row.status = models.CodeStatus.used
                            code_row.used_by_email = email
                            code_row.used_by_mother_id = mother.id
                            code_row.used_by_team_id = team.team_id
                            code_row.used_at = datetime.utcnow()
                            self.db.add(code_row)
                        self.db.add(inv)
                        self.db.add(seat)
                        self.db.commit()
                        return True, "邀请已发送", inv.id, mother.id, team.team_id
                    except provider.ProviderError as e:
                        if e.status in (429, 500, 502, 503, 504) and i < max_retries:
                            time.sleep(delay_sec)
                            delay_sec *= 2
                            continue
                        raise
            except provider.ProviderError as e:
                # Release held seat
                seat.status = models.SeatStatus.free
                seat.held_until = None
                seat.team_id = None
                seat.email = None
                seat.invite_request_id = None
                seat.invite_id = None
                self.db.add(seat)
                # 401/403 => invalidate mother
                if e.status in (401, 403):
                    m = self.db.get(models.MotherAccount, mother.id)
                    if m:
                        m.status = models.MotherStatus.invalid
                        self.db.add(m)
                # If transient and allowed to switch, mark invite failed and try next mother
                if e.status in (429, 500, 502, 503, 504) and switch_remaining > 0:
                    inv.status = models.InviteStatus.failed
                    inv.error_code = getattr(e, "code", "error")
                    inv.error_msg = getattr(e, "message", str(e))[:500]
                    self.db.add(inv)
                    self.db.commit()
                    switch_remaining -= 1
                    continue
                # Final failure
                inv.status = models.InviteStatus.failed
                inv.error_code = getattr(e, "code", "error")
                inv.error_msg = getattr(e, "message", str(e))[:500]
                self.db.add(inv)
                self.db.commit()
                return False, f"邀请失败 {inv.error_code}", inv.id, mother.id, team.team_id
            except Exception as e:
                # Release held seat and mark failure
                seat.status = models.SeatStatus.free
                seat.held_until = None
                seat.team_id = None
                seat.email = None
                seat.invite_request_id = None
                seat.invite_id = None
                self.db.add(seat)
                inv.status = models.InviteStatus.failed
                inv.error_code = "exception"
                inv.error_msg = str(e)[:500]
                self.db.add(inv)
                self.db.commit()
                return False, "邀请失败 系统异常", inv.id, mother.id, team.team_id


def resend_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    inv = (
        db.query(models.InviteRequest)
        .filter(models.InviteRequest.email == email, models.InviteRequest.team_id == team_id)
        .order_by(models.InviteRequest.id.desc())
        .first()
    )
    if not inv or not inv.mother_id:
        return False, "未找到邀请记录"
    mother = db.get(models.MotherAccount, inv.mother_id)
    if not mother or mother.status != models.MotherStatus.active:
        return False, "母号不可用"
    token = decrypt_token(mother.access_token_enc)
    try:
        provider.send_invite(token, inv.team_id, email, resend=True)
        return True, "已重发邀请"
    except provider.ProviderError as e:
        return False, f"重发失败: {e.code}"


def cancel_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    inv = (
        db.query(models.InviteRequest)
        .filter(models.InviteRequest.email == email, models.InviteRequest.team_id == team_id)
        .order_by(models.InviteRequest.id.desc())
        .first()
    )
    if not inv or not inv.mother_id:
        return False, "未找到邀请记录"
    mother = db.get(models.MotherAccount, inv.mother_id)
    if not mother:
        return False, "母号不存在"
    token = decrypt_token(mother.access_token_enc)

    invite_id = inv.invite_id
    try:
        if not invite_id:
            lst = provider.list_invites(token, inv.team_id)
            if isinstance(lst, dict):
                arr = lst.get("invites") or lst.get("data") or lst.get("results") or []
                for item in arr:
                    if isinstance(item, dict) and (item.get("email") == email or email in (item.get("emails") or [])):
                        invite_id = item.get("id")
                        break
        if invite_id:
            provider.cancel_invite(token, inv.team_id, invite_id)
        # Free seat if exists
        seat = (
            db.query(models.SeatAllocation)
            .filter(models.SeatAllocation.team_id == inv.team_id, models.SeatAllocation.email == email)
            .first()
        )
        if seat:
            seat.status = models.SeatStatus.free
            seat.held_until = None
            seat.team_id = None
            seat.email = None
            seat.invite_request_id = None
            seat.invite_id = None
            db.add(seat)
        inv.status = models.InviteStatus.cancelled
        db.add(inv)
        db.commit()
        return True, "已取消邀请并释放席位"
    except provider.ProviderError as e:
        if e.status == 404:
            seat = (
                db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.team_id == inv.team_id, models.SeatAllocation.email == email)
                .first()
            )
            if seat:
                seat.status = models.SeatStatus.free
                seat.held_until = None
                seat.team_id = None
                seat.email = None
                seat.invite_request_id = None
                seat.invite_id = None
                db.add(seat)
            inv.status = models.InviteStatus.cancelled
            db.add(inv)
            db.commit()
            return True, "邀请不存在，视为已取消并释放席位"
        return False, f"取消失败: {e.code}"


def remove_member(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    inv = (
        db.query(models.InviteRequest)
        .filter(models.InviteRequest.email == email, models.InviteRequest.team_id == team_id)
        .order_by(models.InviteRequest.id.desc())
        .first()
    )
    mother_id = inv.mother_id if inv else None
    if not mother_id:
        seat = (
            db.query(models.SeatAllocation)
            .filter(models.SeatAllocation.email == email, models.SeatAllocation.team_id == team_id)
            .first()
        )
        mother_id = seat.mother_id if seat else None
    if not mother_id:
        return False, "未找到对应母号"
    mother = db.get(models.MotherAccount, mother_id)
    if not mother:
        return False, "母号不存在"
    token = decrypt_token(mother.access_token_enc)

    try:
        data = provider.list_members(token, team_id)
        member_id = None
        if isinstance(data, dict):
            arr = data.get("data") or data.get("members") or data.get("users") or []
            for item in arr:
                item_email = item.get("email") if isinstance(item, dict) else None
                if item_email and item_email.lower() == email.lower():
                    member_id = item.get("id") or item.get("member_id") or item.get("user_id")
                    break
        if not member_id:
            return True, "成员不存在，视为已移除"
        provider.delete_member(token, team_id, member_id)
        # Free seat
        seat = (
            db.query(models.SeatAllocation)
            .filter(models.SeatAllocation.email == email, models.SeatAllocation.team_id == team_id)
            .first()
        )
        if seat:
            seat.status = models.SeatStatus.free
            seat.held_until = None
            seat.team_id = None
            seat.email = None
            seat.invite_request_id = None
            seat.invite_id = None
            db.add(seat)
        db.commit()
        return True, "已移除成员并释放席位"
    except provider.ProviderError as e:
        if e.status in (404, 204):
            seat = (
                db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.email == email, models.SeatAllocation.team_id == team_id)
                .first()
            )
            if seat:
                seat.status = models.SeatStatus.free
                seat.held_until = None
                seat.team_id = None
                seat.email = None
                seat.invite_request_id = None
                seat.invite_id = None
                db.add(seat)
            db.commit()
            return True, "成员不存在，视为已移除并释放席位"
        return False, f"移除失败: {e.code}"
