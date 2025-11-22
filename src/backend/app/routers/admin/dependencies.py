"""管理后台公共依赖"""
from fastapi import Depends, Request, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.database import get_db as _get_db
from app.database import get_db_pool as _get_db_pool
from app.config import settings
from app.security import verify_session, unsign_session
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit


# 关键：让 get_db 直接别名到 app.database.get_db，以便测试中的 FastAPI 依赖覆盖生效
get_db = _get_db
get_db_pool = _get_db_pool


def require_admin(request: Request, db: Session = Depends(get_db)):
    """管理员校验：dev 环境可跳过；prod 需有效会话。"""
    if settings.env in ("dev", "development", "test", "testing"):
        request.state.admin_session = "dev-session"
        request.state.admin_user = "dev"
        return None

    sess = request.cookies.get("admin_session")
    if not sess or not verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds):
        raise HTTPException(status_code=401, detail="未认证")
    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)
    if not sid:
        raise HTTPException(status_code=401, detail="未认证")
    # 可选：校验 session 未被撤销和未过期
    try:
        from app import models
        row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
        import datetime as _dt
        now = _dt.datetime.utcnow()
        if not row or row.revoked or row.expires_at <= now:
            raise HTTPException(status_code=401, detail="会话失效")
    except HTTPException:
        raise
    except Exception:
        # 容错：查询异常按未认证处理
        raise HTTPException(status_code=401, detail="未认证")
    request.state.admin_session = sid
    request.state.admin_user = "admin"
    return None


async def get_admin_rate_limiter():
    """获取管理员限流器"""
    return await get_rate_limiter()


async def admin_login_rate_limit_dep(request: Request, limiter=Depends(get_admin_rate_limiter)):
    """管理员登录限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="admin:by_ip")
    await dependency(request)


async def admin_ops_rate_limit_dep(request: Request, limiter=Depends(get_admin_rate_limiter)):
    """管理员操作限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="admin:by_ip")
    await dependency(request)


__all__ = [
    "get_db",
    "get_db_pool",
    "require_admin",
    "get_admin_rate_limiter",
    "admin_login_rate_limit_dep",
    "admin_ops_rate_limit_dep",
]


def require_domain(expected: str):
    """构造一个依赖函数：校验前端传入的 X-Domain 与期望的域一致。

    - dev/test 环境默认跳过；prod 强制校验，不符返回 400。
    - 仅用于管理端 API；公共/匿名接口无需传该头。
    """

    async def _checker(request: Request):
        if settings.env in ("dev", "development", "test", "testing"):
            return None
        domain = request.headers.get("X-Domain")
        if not domain:
            raise HTTPException(status_code=400, detail="缺少 X-Domain")
        if domain not in ("users", "pool"):
            raise HTTPException(status_code=400, detail="非法 X-Domain")
        if domain != expected:
            raise HTTPException(status_code=400, detail=f"X-Domain 不匹配，期望 {expected}")
        return None

    return _checker
