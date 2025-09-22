from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.metrics import provider_metrics


router = APIRouter(prefix="/api/admin", tags=["admin-stats"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    mothers = db.query(models.MotherAccount).count()
    teams = db.query(models.MotherTeam).count()
    # 浠呯粺璁″浜?held/used 鐨勫腑浣嶆暟閲忥紝绗﹀悎鈥滃凡鍗犵敤甯綅鈥濈殑璇箟
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

