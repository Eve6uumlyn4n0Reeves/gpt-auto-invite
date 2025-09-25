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

    def _choose_target(self, email: str, exclude_mother_ids: Optional[set[int]] = None) -> Optional[tuple[models.MotherAccount, models.MotherTeam]]:
        # 选择座位占用更少且活跃的母号，并排除该邮箱已在团队中的团队
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
            teams = [
                t
                for t in teams
                if not self.db.query(models.SeatAllocation)
                .filter(models.SeatAllocation.team_id == t.team_id, models.SeatAllocation.email == email)
                .first()
            ]
            
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
                return False, "暂无可用座位（所有母号已满或团队不可用）", None, None, None
            
            mother, team = choice
            tried_mothers.add(mother.id)
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
                return False, f"邀请失败: {inv.error_msg}", inv.id, mother.id, team.team_id

def resend_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )
    
    if not seat or not seat.invite_request_id:
        return False, "未找到相关邀请记录"
    
    inv = db.get(models.InviteRequest, seat.invite_request_id)
    if not inv:
        return False, "邀请记录不存在"
    
    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother or mother.status != models.MotherStatus.active:
        return False, "母号不可用"
    
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
        return False, f"重发失败: {inv.error_msg}"

def cancel_invite(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )
    
    if not seat or not seat.invite_id:
        return False, "未找到邀请记录"
    
    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother:
        return False, "母号不存在"
    
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
    except Exception as e:
        return False, f"取消失败: {e}"

def remove_member(db: Session, email: str, team_id: str) -> tuple[bool, str]:
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.team_id == team_id, models.SeatAllocation.email == email)
        .first()
    )
    
    if not seat or not seat.member_id:
        return False, "未找到成员记录"
    
    mother = db.get(models.MotherAccount, seat.mother_id)
    if not mother:
        return False, "母号不存在"
    
    access_token = decrypt_token(mother.access_token_enc)
    
    try:
        provider.delete_member(access_token, team_id, seat.member_id)
        
        _clear_seat(seat)
        db.add(seat)
        db.commit()
        
        return True, "移除成功"
    except Exception as e:
        return False, f"移除失败: {e}"

