from sqlalchemy.orm import Session
from sqlalchemy import update, select
from datetime import datetime, timedelta
from typing import Optional
from app import models
from app.security import decrypt_token
from app import provider
import time

HELD_TTL_SECONDS = 30
RETRY_STATUS = (429, 500, 502, 503, 504)


def _clear_seat(seat: models.SeatAllocation) -> None:
    seat.status = models.SeatStatus.free
    seat.held_until = None
    seat.team_id = None
    seat.email = None
    seat.invite_request_id = None
    seat.invite_id = None


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


class InviteService:
    def __init__(self, db: Session):
        self.db = db

    def _choose_target(
        self, email: str, exclude_mother_ids: Optional[set[int]] = None
    ) -> Optional[tuple[models.MotherAccount, models.MotherTeam]]:
        """
        选择目标母号与团队：
        - 优先填满单个母号再切换（按母号创建时间由早到晚遍历）
        - 仅考虑活跃母号，且需存在可用团队与空位
        - 同一邮箱允许加入多个 team，但同一 team 内不能重复
        """
        mothers = (
            self.db.query(models.MotherAccount)
            .filter(models.MotherAccount.status == models.MotherStatus.active)
            .order_by(models.MotherAccount.created_at.asc())
            .all()
        )

        for mother in mothers:
            if exclude_mother_ids and mother.id in exclude_mother_ids:
                continue

            # 必须有空位
            has_free = (
                self.db.query(models.SeatAllocation)
                .filter(
                    models.SeatAllocation.mother_id == mother.id,
                    models.SeatAllocation.status == models.SeatStatus.free,
                )
                .first()
            ) is not None
            if not has_free:
                continue

            # 从已启用的团队里选择一个该邮箱尚未存在的团队，默认团队优先
            teams_enabled = [t for t in mother.teams if t.is_enabled]
            teams_available = [
                t
                for t in teams_enabled
                if not self.db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.team_id == t.team_id, models.SeatAllocation.email == email)
                .first()
            ]

            if not teams_available:
                continue

            default = next((t for t in teams_available if t.is_default), None)
            return mother, (default or teams_available[0])

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

            mother, team = choice
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
            held_until = datetime.utcnow() + timedelta(seconds=HELD_TTL_SECONDS)

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
                    seat = candidate
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
                    # 否则说明并发冲突，重试

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
                    time.sleep(1)
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

    if not seat or not seat.member_id:
        return False, "操作失败，请稍后重试"

    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother:
        return False, "操作失败，请稍后重试"

    access_token = decrypt_token(mother.access_token_enc)

    try:
        provider.delete_member(access_token, team_id, seat.member_id)

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
