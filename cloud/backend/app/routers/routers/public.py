from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas import RedeemIn, RedeemOut, ResendIn
from app.utils.utils.email_utils import is_valid_email
from app.services.services.redeem import redeem_code
from app.services.services.invites import resend_invite
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy, email_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit
from starlette.requests import Request as StarletteRequest


async def get_rate_limiter_dep():
    """获取限流器依赖"""
    return await get_rate_limiter()


async def redeem_rate_limit_dep(request: StarletteRequest, limiter = Depends(get_rate_limiter_dep)):
    """兑换接口限流依赖"""
    return rate_limit(limiter, ip_strategy, config_id="redeem:by_ip")(request)


async def resend_rate_limit_dep(request: StarletteRequest, limiter = Depends(get_rate_limiter_dep)):
    """重发接口限流依赖"""
    return rate_limit(limiter, ip_strategy, config_id="resend:by_ip")(request)

router = APIRouter(prefix="/api", tags=["public"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/redeem", response_model=RedeemOut)
async def redeem(
    req: RedeemIn,
    request: StarletteRequest,
    db: Session = Depends(get_db),
    _: None = Depends(redeem_rate_limit_dep)
):
    """兑换邀请码 - 限流：每小时5次（按IP）"""

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
async def redeem_resend(
    req: ResendIn,
    request: StarletteRequest,
    db: Session = Depends(get_db),
    _: None = Depends(resend_rate_limit_dep)
):
    """重发邀请 - 限流：每小时3次（按IP）"""

    if not is_valid_email(req.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    if not req.team_id:
        raise HTTPException(status_code=400, detail="缺少 team_id")

    ok, msg = resend_invite(db, req.email.strip().lower(), req.team_id)
    return {"success": ok, "message": msg}
