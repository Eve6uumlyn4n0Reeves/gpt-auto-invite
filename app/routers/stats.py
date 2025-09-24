from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.metrics import provider_metrics
from app.routers.admin import require_admin


router = APIRouter(prefix="/api/admin", tags=["admin-stats"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/stats")
def stats(request: Request, db: Session = Depends(get_db)):
    # Protect admin stats
    require_admin(request, db)
    mothers = db.query(models.MotherAccount).count()
    teams = db.query(models.MotherTeam).count()
    # 统计处于 held/used 状态的席位数量，符合“已占用席位”的定义
    seats_used = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
        .count()
    )
    invites_total = db.query(models.InviteRequest).count()
    invites_sent = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.sent).count()
    invites_failed = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.failed).count()
    return {
        "mothers": mothers,
        "teams": teams,
        "seats_used": seats_used,
        "invites_total": invites_total,
        "invites_sent": invites_sent,
        "invites_failed": invites_failed,
        "provider_metrics": provider_metrics.snapshot(),
    }
