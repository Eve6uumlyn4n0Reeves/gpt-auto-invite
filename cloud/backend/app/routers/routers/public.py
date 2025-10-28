from fastapi import APIRouter, Depends, HTTPException
from app.schemas import RedeemIn, RedeemOut, ResendIn
from app.utils.utils.email_utils import is_valid_email
from app.services.services.redeem import redeem_code
from app.services.services.invites import resend_invite
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit
from starlette.requests import Request as StarletteRequest
from fastapi.concurrency import run_in_threadpool
# 注意：不要改名，测试会在 conftest 中覆盖 public.SessionLocal
from app.database import SessionLocal, SessionPool


async def get_rate_limiter_dep():
    """获取限流器依赖"""
    return await get_rate_limiter()


async def redeem_rate_limit_dep(request: StarletteRequest, limiter = Depends(get_rate_limiter_dep)):
    """兑换接口限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="redeem:by_ip")
    await dependency(request)


async def resend_rate_limit_dep(request: StarletteRequest, limiter = Depends(get_rate_limiter_dep)):
    """重发接口限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="resend:by_ip")
    await dependency(request)

router = APIRouter(prefix="/api", tags=["public"])


@router.post("/redeem", response_model=RedeemOut)
async def redeem(
    req: RedeemIn,
    request: StarletteRequest,
    _: None = Depends(redeem_rate_limit_dep)
):
    """兑换邀请码 - 限流：每小时5次（按IP）"""

    if not is_valid_email(req.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    def _redeem_sync() -> RedeemOut:
        db = SessionLocal()
        try:
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
        finally:
            db.close()

    return await run_in_threadpool(_redeem_sync)


@router.post("/redeem/resend")
async def redeem_resend(
    req: ResendIn,
    request: StarletteRequest,
    _: None = Depends(resend_rate_limit_dep)
):
    """重发邀请 - 限流：每小时3次（按IP）"""

    if not is_valid_email(req.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    if not req.team_id:
        raise HTTPException(status_code=400, detail="缺少 team_id")

    def _resend_sync() -> dict:
        db_users = SessionLocal()
        db_pool = SessionPool()
        try:
            ok, msg = resend_invite(db_users, db_pool, req.email.strip().lower(), req.team_id)
            return {"success": ok, "message": msg}
        finally:
            db_pool.close()
            db_users.close()

    return await run_in_threadpool(_resend_sync)
