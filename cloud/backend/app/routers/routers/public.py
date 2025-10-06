from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas import RedeemIn, RedeemOut, ResendIn
from app.utils.email_utils import is_valid_email
from app.services.redeem import redeem_code
from app.services.invites import resend_invite
from app.utils.rate_limit import SimpleRateLimiter
from starlette.requests import Request as StarletteRequest

router = APIRouter(prefix="/api", tags=["public"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# simple in-memory rate limiters
redeem_rl = SimpleRateLimiter(max_events=60, per_seconds=60)
resend_rl = SimpleRateLimiter(max_events=10, per_seconds=60)


@router.post("/redeem", response_model=RedeemOut)
def redeem(req: RedeemIn, request: StarletteRequest, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "_"
    if not redeem_rl.allow(f"redeem:{ip}"):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试")

    if not is_valid_email(req.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    ok, msg, invite_request_id, mother_id, team_id = redeem_code(
        db, req.code.strip(), req.email.strip().lower()
    )

    return RedeemOut(
        success=ok,
        message=msg,
        invite_request_id=invite_request_id,
        mother_id=mother_id,
        team_id=team_id,
    )


@router.post("/redeem/resend")
def redeem_resend(req: ResendIn, request: StarletteRequest, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "_"
    key = f"resend:{ip}:{(req.email or '').lower()}"
    if not resend_rl.allow(key):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试")

    if not is_valid_email(req.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    if not req.team_id:
        raise HTTPException(status_code=400, detail="缺少 team_id")

    ok, msg = resend_invite(db, req.email.strip().lower(), req.team_id)
    return {"success": ok, "message": msg}
