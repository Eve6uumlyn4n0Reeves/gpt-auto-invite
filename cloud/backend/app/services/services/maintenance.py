from datetime import datetime
from sqlalchemy.orm import Session
from app import models

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
