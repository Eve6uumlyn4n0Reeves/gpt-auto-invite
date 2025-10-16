from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from app.metrics_prom import CONTENT_TYPE_LATEST  # noqa: F401 (ensure module init)
try:
    from app.metrics_prom import Counter
except Exception:
    Counter = None

if Counter:
    invite_accept_updates_total = Counter(
        'invite_accept_updates_total',
        'Total invites marked as accepted by sync task'
    )
from app.security import decrypt_token
from app import provider

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

def cleanup_stale_held(db: Session) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(models.SeatAllocation)
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
        db.add(seat)
    
    if count:
        db.commit()
    
    return count


def cleanup_expired_mother_teams(db: Session) -> int:
    """删除已过期母号的团队，并清理其席位。

    - 条件：mother.token_expires_at 存在且小于当前时间
    - 操作：
        1) 将该母号的所有席位重置为 free，清空关联字段
        2) 删除该母号的所有团队（MotherTeam）
        3) 将母号标记为 invalid，避免后续被选中

    返回删除的团队数量。
    """
    now = datetime.utcnow()
    mothers = (
        db.query(models.MotherAccount)
        .filter(models.MotherAccount.token_expires_at != None)  # noqa: E711
        .filter(models.MotherAccount.token_expires_at < now)
        .all()
    )

    total_deleted_teams = 0
    if not mothers:
        return 0

    for mother in mothers:
        # 清理席位到空闲
        seats = db.query(models.SeatAllocation).filter(models.SeatAllocation.mother_id == mother.id).all()
        for seat in seats:
            seat.status = models.SeatStatus.free
            seat.held_until = None
            seat.team_id = None
            seat.email = None
            seat.invite_request_id = None
            seat.invite_id = None
            seat.member_id = None
            db.add(seat)

        # 删除团队
        deleted = db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother.id).delete()
        total_deleted_teams += deleted

        # 标记母号为 invalid（令牌已过期）
        try:
            mother.status = models.MotherStatus.invalid
            db.add(mother)
        except Exception:
            pass

    db.commit()
    return total_deleted_teams


def sync_invite_acceptance(db: Session, *, days: int = 30, limit_groups: int = 20) -> int:
    """同步邀请接受状态：将已加入团队的用户标记为 accepted，并回填 member_id。

    - 按 (mother_id, team_id) 分组批量请求，减少上游调用
    - 仅处理最近 N 天内 status=sent 且未赋值 member_id 的 InviteRequest
    - 返回更新数量
    """
    from sqlalchemy import and_, func

    now = datetime.utcnow()
    since = now.replace(microsecond=0) - __import__("datetime").timedelta(days=days)

    q = (
        db.query(
            models.InviteRequest.mother_id,
            models.InviteRequest.team_id,
            func.count(models.InviteRequest.id),
        )
        .filter(
            models.InviteRequest.status == models.InviteStatus.sent,
            models.InviteRequest.last_attempt_at != None,  # noqa: E711
            models.InviteRequest.last_attempt_at >= since,
        )
        .group_by(models.InviteRequest.mother_id, models.InviteRequest.team_id)
        .order_by(func.max(models.InviteRequest.updated_at).desc())
    )

    updated = 0
    groups = q.limit(limit_groups).all()
    for mother_id, team_id, _ in groups:
        if not mother_id or not team_id:
            continue
        mother = db.get(models.MotherAccount, mother_id)
        if not mother or mother.status != models.MotherStatus.active:
            continue
        try:
            access_token = decrypt_token(mother.access_token_enc)
            payload = provider.list_members(access_token, team_id)
        except provider.ProviderError as e:
            if e.status in (401, 403):
                try:
                    mother.status = models.MotherStatus.invalid
                    db.add(mother)
                    db.commit()
                except Exception:
                    db.rollback()
            continue
        except Exception:
            continue

        invites = (
            db.query(models.InviteRequest)
            .filter(
                models.InviteRequest.mother_id == mother_id,
                models.InviteRequest.team_id == team_id,
                models.InviteRequest.status == models.InviteStatus.sent,
            )
            .all()
        )
        for inv in invites:
            member_id = _find_member_id_by_email(payload, inv.email)
            if not member_id:
                continue
            seat = (
                db.query(models.SeatAllocation)
                .filter(
                    models.SeatAllocation.mother_id == mother_id,
                    models.SeatAllocation.team_id == team_id,
                    models.SeatAllocation.email == inv.email,
                )
                .first()
            )
            if seat:
                seat.member_id = member_id
                db.add(seat)
            inv.member_id = member_id
            inv.status = models.InviteStatus.accepted
            db.add(inv)
            updated += 1
        if updated:
            try:
                db.commit()
                if Counter:
                    invite_accept_updates_total.inc(updated)
            except Exception:
                db.rollback()
    return updated
