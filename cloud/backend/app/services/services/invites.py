from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence, Set

from sqlalchemy import select, update
import time as _time
from sqlalchemy.orm import Session

from app import models, provider
from app.config import settings
from app.security import decrypt_token

RETRY_STATUS = (429, 500, 502, 503, 504)


@dataclass
class TargetSelection:
    mother: models.MotherAccount
    team: models.MotherTeam
    seat_id: int


def _clear_seat(seat: models.SeatAllocation) -> None:
    seat.status = models.SeatStatus.free
    seat.held_until = None
    seat.team_id = None
    seat.email = None
    seat.invite_request_id = None
    seat.invite_id = None
    seat.member_id = None


def _release_seat_by_team_email(db: Session, team_id: str, email: str) -> bool:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )
    if not seat:
        return False
    _clear_seat(seat)
    db.add(seat)
    return True


def _find_member_id_by_email(payload: object, email: str) -> Optional[str]:
    """在成员列表响应中，根据邮箱查找成员ID。"""
    if not payload:
        return None

    target = email.lower()
    stack: list[object] = [payload]
    seen: set[int] = set()

    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            identity = id(current)
            if identity in seen:
                continue
            seen.add(identity)

            candidate_email = current.get("email") or current.get("email_address")
            if not candidate_email:
                user_info = current.get("user") or current.get("member") or current.get("account")
                if isinstance(user_info, dict):
                    candidate_email = user_info.get("email") or user_info.get("email_address")

            if isinstance(candidate_email, str) and candidate_email.lower() == target:
                for key in ("id", "member_id", "user_id", "account_user_id"):
                    member_id = current.get(key)
                    if member_id:
                        return str(member_id)

            for value in current.values():
                if isinstance(value, (dict, list)):
                    stack.append(value)
        elif isinstance(current, list):
            for item in current:
                if isinstance(item, (dict, list)):
                    stack.append(item)

    return None


class InviteService:
    def __init__(self, db: Session):
        self.db = db

    def _choose_target(
        self, email: str, exclude_mother_ids: Optional[set[int]] = None
    ) -> Optional[TargetSelection]:
        """
        选择目标母号与团队：
        - 优先填满单个母号再切换（按母号创建时间由早到晚遍历）
        - 仅考虑活跃母号，且需存在可用团队与空位
        - 同一邮箱允许加入多个 team，但同一 team 内不能重复
        - 按批次流式遍历母号，逐个查询空座与可用团队，避免一次性加载全部数据
        """
        exclude_ids = exclude_mother_ids or set()

        mothers_query = (
            self.db.query(models.MotherAccount)
            .filter(models.MotherAccount.status == models.MotherStatus.active)
            .order_by(models.MotherAccount.created_at.asc())
        )
        if exclude_ids:
            mothers_query = mothers_query.filter(~models.MotherAccount.id.in_(exclude_ids))  # type: ignore[arg-type]

        batch_size = 50
        mothers_iter = mothers_query.yield_per(batch_size)
        batch: list[models.MotherAccount] = []

        for mother in mothers_iter:
            batch.append(mother)
            if len(batch) >= batch_size:
                selection = self._choose_from_batch(batch, email)
                if selection:
                    return selection
                batch.clear()

        if batch:
            return self._choose_from_batch(batch, email)

        return None

    def _choose_from_batch(
        self, mothers: Sequence[models.MotherAccount], email: str
    ) -> Optional[TargetSelection]:
        """在一批母号中选择目标，减少 N+1 查询。"""
        if not mothers:
            return None

        mother_ids = [mother.id for mother in mothers]

        seats = (
            self.db.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status == models.SeatStatus.free,
            )
            .order_by(models.SeatAllocation.mother_id.asc(), models.SeatAllocation.slot_index.asc())
            .all()
        )
        seat_map: dict[int, models.SeatAllocation] = {}
        for seat in seats:
            seat_map.setdefault(seat.mother_id, seat)

        teams = (
            self.db.query(models.MotherTeam)
            .filter(
                models.MotherTeam.mother_id.in_(mother_ids),
                models.MotherTeam.is_enabled == True,  # noqa: E712
            )
            .order_by(
                models.MotherTeam.mother_id.asc(),
                models.MotherTeam.is_default.desc(),
                models.MotherTeam.id.asc(),
            )
            .all()
        )
        teams_map: dict[int, list[models.MotherTeam]] = defaultdict(list)
        team_ids: list[str] = []
        for team in teams:
            teams_map[team.mother_id].append(team)
            if team.team_id:
                team_ids.append(team.team_id)

        existing_for_email: Set[str] = set()
        if team_ids:
            rows = (
                self.db.query(models.SeatAllocation.team_id)
                .filter(
                    models.SeatAllocation.team_id.in_(team_ids),
                    models.SeatAllocation.email == email,
                )
                .all()
            )
            existing_for_email = {team_id for team_id, in rows if team_id}

        for mother in mothers:
            seat = seat_map.get(mother.id)
            if not seat:
                continue
            teams_for_mother = teams_map.get(mother.id)
            if not teams_for_mother:
                continue

            available = [
                t for t in teams_for_mother if t.team_id and t.team_id not in existing_for_email
            ]
            if not available:
                continue

            default_team = next((t for t in available if t.is_default), None)
            chosen_team = default_team or available[0]
            return TargetSelection(mother=mother, team=chosen_team, seat_id=seat.id)

        return None

    def invite_email(
        self, email: str, code_row: Optional[models.RedeemCode]
    ) -> tuple[bool, str, Optional[int], Optional[int], Optional[str]]:
        tried_mothers: set[int] = set()
        switch_remaining = 1

        while True:
            choice = self._choose_target(email, exclude_mother_ids=tried_mothers)
            if not choice:
                return False, "暂无可用座位（所有母号已满或团队不可用）", None, None, None

            mother = choice.mother
            team = choice.team
            tried_mothers.add(mother.id)

            # 若 token 已过期，则标记为不可用并尝试下一个母号
            try:
                now = datetime.utcnow()
                if mother.token_expires_at and mother.token_expires_at < now:
                    mother.status = models.MotherStatus.invalid
                    self.db.add(mother)
                    self.db.commit()
                    continue
            except Exception:
                pass

            access_token = decrypt_token(mother.access_token_enc)

            # 已占用（幂等）
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
                return True, "已占用该团队座位", exists.invite_request_id, mother.id, team.team_id

            # 抢占 free 座位，置为 held，30s TTL
            seat = None
            dialect = getattr(getattr(self.db, "bind", None), "dialect", None)
            is_pg = bool(dialect and getattr(dialect, "name", "").startswith("postgres"))
            held_until = datetime.utcnow() + timedelta(seconds=settings.seat_hold_ttl_seconds)

            if is_pg:
                candidate = self.db.execute(
                    select(models.SeatAllocation)
                    .where(
                        models.SeatAllocation.id == choice.seat_id,
                        models.SeatAllocation.mother_id == mother.id,
                        models.SeatAllocation.status == models.SeatStatus.free,
                    )
                    .order_by(models.SeatAllocation.slot_index.asc())
                    .with_for_update(skip_locked=True)
                ).scalars().first()
                if candidate:
                    seat = candidate
                    seat.status = models.SeatStatus.held
                    seat.held_until = held_until
                    seat.team_id = team.team_id
                    seat.email = email
                    self.db.add(seat)
                    self.db.commit()
            else:
                claim_attempts = max(1, settings.seat_claim_retry_attempts)
                backoff_ms = max(1, settings.seat_claim_backoff_ms_base)
                while claim_attempts > 0 and seat is None:
                    claim_attempts -= 1
                    candidate = self.db.get(models.SeatAllocation, choice.seat_id)
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
                    # 否则说明并发冲突，重试
                    if claim_attempts > 0:
                        _time.sleep(min(backoff_ms / 1000.0, settings.seat_claim_backoff_ms_max / 1000.0))
                        backoff_ms = min(backoff_ms * 2, settings.seat_claim_backoff_ms_max)

            if seat is None:
                if switch_remaining > 0:
                    switch_remaining -= 1
                    continue
                return False, "暂无可用座位（座位被占用）", None, mother.id, team.team_id

            # 先创建 InviteRequest 再发送，避免长时间 pending
            inv = models.InviteRequest(
                mother_id=mother.id,
                team_id=team.team_id,
                email=email,
                code_id=code_row.id if code_row else None,
                status=models.InviteStatus.pending,
            )
            self.db.add(inv)
            self.db.flush()

            seat.invite_request_id = inv.id
            self.db.add(seat)
            self.db.commit()

            # 发送邀请
            try:
                resp = provider.send_invite(access_token, team.team_id, email)
                invites = resp.get("invites", [])
                if invites:
                    invite_data = invites[0]
                    inv.invite_id = invite_data.get("id")
                    inv.status = models.InviteStatus.sent
                    seat.invite_id = inv.invite_id
                    seat.status = models.SeatStatus.used
                else:
                    inv.status = models.InviteStatus.failed
                    inv.error_msg = "No invites in response"
                    _clear_seat(seat)
            except provider.ProviderError as e:
                inv.status = models.InviteStatus.failed
                inv.error_code = e.code
                inv.error_msg = e.message
                _clear_seat(seat)
                # 401/403 代表令牌失效或权限问题：标记母号为 invalid，切换下一个母号
                if e.status in (401, 403):
                    try:
                        mother.status = models.MotherStatus.invalid
                        self.db.add(mother)
                        self.db.commit()
                    except Exception:
                        self.db.rollback()

                if e.status in RETRY_STATUS and switch_remaining > 0:
                    switch_remaining -= 1
                    self.db.add(inv)
                    self.db.add(seat)
                    self.db.commit()
                    continue
            except Exception as e:
                inv.status = models.InviteStatus.failed
                inv.error_msg = str(e)
                _clear_seat(seat)

            inv.attempt_count += 1
            inv.last_attempt_at = datetime.utcnow()
            self.db.add(inv)
            self.db.add(seat)
            self.db.commit()

            if code_row and inv.status == models.InviteStatus.sent:
                code_row.status = models.CodeStatus.used
                code_row.used_by_email = email
                code_row.used_by_mother_id = mother.id
                code_row.used_by_team_id = team.team_id
                code_row.used_at = datetime.utcnow()
                self.db.add(code_row)
                self.db.commit()

            if inv.status == models.InviteStatus.sent:
                return True, "邀请已发送", inv.id, mother.id, team.team_id
            else:
                # 返回中性化错误，具体错误保存在 inv.error_msg
                return False, "邀请发送失败，请稍后重试", inv.id, mother.id, team.team_id


def resend_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )

    if not seat or not seat.invite_request_id:
        return False, "操作失败，请稍后重试"

    inv = db.get(models.InviteRequest, seat.invite_request_id)
    if not inv:
        return False, "操作失败，请稍后重试"

    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother or mother.status != models.MotherStatus.active:
        return False, "操作失败，请稍后重试"

    access_token = decrypt_token(mother.access_token_enc)

    try:
        resp = provider.send_invite(access_token, team_id, email, resend=True)
        invites = resp.get("invites", [])
        if invites:
            invite_data = invites[0]
            inv.invite_id = invite_data.get("id")
            inv.status = models.InviteStatus.sent
            seat.invite_id = inv.invite_id
            seat.status = models.SeatStatus.used
        else:
            inv.status = models.InviteStatus.failed
            inv.error_msg = "No invites in response"
    except provider.ProviderError as e:
        inv.status = models.InviteStatus.failed
        inv.error_msg = str(e)
        # 标记令牌失效的母号，便于后续绕过
        if e.status in (401, 403):
            try:
                mother.status = models.MotherStatus.invalid
                db.add(mother)
                db.commit()
            except Exception:
                db.rollback()
    except Exception as e:
        inv.status = models.InviteStatus.failed
        inv.error_msg = str(e)

    inv.attempt_count += 1
    inv.last_attempt_at = datetime.utcnow()
    db.add(inv)
    db.add(seat)
    db.commit()

    if inv.status == models.InviteStatus.sent:
        return True, "重发成功"
    else:
        return False, "重发失败，请稍后重试"


def cancel_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )

    if not seat or not seat.invite_id:
        return False, "操作失败，请稍后重试"

    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother:
        return False, "操作失败，请稍后重试"

    access_token = decrypt_token(mother.access_token_enc)

    try:
        provider.cancel_invite(access_token, team_id, seat.invite_id)

        # 更新状态
        if seat.invite_request_id:
            inv = db.get(models.InviteRequest, seat.invite_request_id)
            if inv:
                inv.status = models.InviteStatus.cancelled
                db.add(inv)

        _clear_seat(seat)
        db.add(seat)
        db.commit()

        return True, "取消成功"
    except provider.ProviderError as e:
        if e.status in (401, 403):
            try:
                mother.status = models.MotherStatus.invalid
                db.add(mother)
                db.commit()
            except Exception:
                db.rollback()
        return False, "取消失败，请稍后重试"
    except Exception:
        return False, "取消失败，请稍后重试"


def remove_member(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )

    if not seat:
        return False, "操作失败，请稍后重试"

    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother:
        return False, "操作失败，请稍后重试"

    access_token = decrypt_token(mother.access_token_enc)
    member_id = seat.member_id

    if not member_id:
        try:
            members_payload = provider.list_members(access_token, team_id)
            member_id = _find_member_id_by_email(members_payload, email)
        except provider.ProviderError as e:
            if e.status in (401, 403):
                try:
                    mother.status = models.MotherStatus.invalid
                    db.add(mother)
                    db.commit()
                except Exception:
                    db.rollback()
            return False, "操作失败，请稍后重试"
        except Exception:
            return False, "操作失败，请稍后重试"

        if not member_id:
            return False, "操作失败，请稍后重试"

    try:
        provider.delete_member(access_token, team_id, member_id)

        _clear_seat(seat)
        db.add(seat)
        db.commit()

        return True, "移除成功"
    except provider.ProviderError as e:
        if e.status in (401, 403):
            try:
                mother.status = models.MotherStatus.invalid
                db.add(mother)
                db.commit()
            except Exception:
                db.rollback()
        return False, "移除失败，请稍后重试"
    except Exception:
        return False, "移除失败，请稍后重试"
