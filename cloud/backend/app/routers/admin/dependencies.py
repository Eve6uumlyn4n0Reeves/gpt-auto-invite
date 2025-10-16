"""
管理后台公共依赖
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import SessionLocal
from app.security import (
    verify_session,
    unsign_session,
)
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_admin(request: Request, db: Session = Depends(get_db)):
    sess = request.cookies.get("admin_session")
    if not sess or not verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds):
        raise HTTPException(status_code=401, detail="未认证")

    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)
    if not sid:
        raise HTTPException(status_code=401, detail="未认证")

    row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
    now = __import__("datetime").datetime.utcnow()
    if not row or row.revoked or row.expires_at <= now:
        raise HTTPException(status_code=401, detail="未认证")

    row.last_seen_at = now
    db.add(row)
    db.commit()


async def get_admin_rate_limiter():
    """获取管理员限流器"""
    return await get_rate_limiter()


async def admin_login_rate_limit_dep(request: Request, limiter = Depends(get_admin_rate_limiter)):
    """管理员登录限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="admin:by_ip")
    await dependency(request)


async def admin_ops_rate_limit_dep(request: Request, limiter = Depends(get_admin_rate_limiter)):
    """管理员操作限流依赖"""
    dependency = rate_limit(limiter, ip_strategy, config_id="admin:by_ip")
    await dependency(request)


__all__ = [
    "get_db",
    "require_admin",
    "get_admin_rate_limiter",
    "admin_login_rate_limit_dep",
    "admin_ops_rate_limit_dep",
]
