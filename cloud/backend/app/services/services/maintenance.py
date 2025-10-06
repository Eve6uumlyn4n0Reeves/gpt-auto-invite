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
