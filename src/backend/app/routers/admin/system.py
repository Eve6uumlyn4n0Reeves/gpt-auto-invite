"""
系统与运行状态相关路由
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from .dependencies import require_admin, get_db  # noqa: F401 (保留以确保依赖可用)
from app.database import engine_users, engine_pool
from app.config import settings
from app.services.services.rate_limiter_service import get_rate_limiter
from app.utils.utils.rate_limiter.config import RateLimitConfig


router = APIRouter()


def _status_for_engine(engine):
    status = {
        "ok": False,
        "url": None,
        "dialect": None,
        "alembic_version": None,
        "error": None,
    }
    try:
        status["url"] = engine.url.render_as_string(hide_password=True)
        status["dialect"] = engine.dialect.name
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            try:
                res = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                status["alembic_version"] = res
            except Exception:
                status["alembic_version"] = None
        status["ok"] = True
    except Exception as e:
        status["error"] = str(e)
    return status


@router.get("/db-status")
def db_status(request: Request):
    # 仅要求管理员已登录（使用 users 库会话验证）
    from .dependencies import require_admin, get_db as _get_db
    import contextlib
    db = None
    try:
        # 获取一次 users 会话用于 require_admin 校验
        db = next(_get_db())
        require_admin(request, db)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            if db is not None:
                db.close()

    return {
        "users": _status_for_engine(engine_users),
        "pool": _status_for_engine(engine_pool),
    }


__all__ = ["router"]


@router.get("/system")
def system_settings(request: Request):
    """暴露关键运行参数（只读）。生产环境需管理员登录。

    返回：
    - env：当前环境
    - jobs：队列租约与最大重试
    - rate_limit：是否启用
    - ingest_api：是否启用
    """
    from .dependencies import require_admin, get_db as _get_db
    import contextlib
    db = None
    try:
        db = next(_get_db())
        require_admin(request, db)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            if db is not None:
                db.close()

    return {
        "env": settings.env,
        "jobs": {
            "visibility_timeout_seconds": settings.job_visibility_timeout_seconds,
            "max_attempts": settings.job_max_attempts,
        },
        "rate_limit": {
            "enabled": settings.rate_limit_enabled,
            "namespace": settings.rate_limit_namespace,
        },
        "ingest_api": {
            "enabled": settings.ingest_api_enabled,
        },
    }


@router.get("/settings")
async def get_admin_settings(request: Request):
    """统一下发前端所需的可变策略（限流、Cookie校验）。

    - rate_limit_policies：将后端令牌桶配置映射为前端可用的 windowMs/maxRequests
    - cookie_policy：最小长度、推荐关键键名
    """
    from .dependencies import require_admin, get_db as _get_db
    import contextlib
    db = None
    try:
        db = next(_get_db())
        require_admin(request, db)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            if db is not None:
                db.close()

    limiter = await get_rate_limiter()

    async def _to_window(cfg_id: str) -> dict:
        cfg: RateLimitConfig | None = await limiter.get_config(cfg_id)
        if not cfg or not cfg.refill_rate:
            # fallback: 60/min
            return {"windowMs": 60_000, "maxRequests": getattr(cfg, 'capacity', 60) if cfg else 60}
        window_ms = int(round((cfg.capacity / cfg.refill_rate) * 1000))
        return {"windowMs": max(1000, window_ms), "maxRequests": cfg.capacity}

    policies = {
        "redeem": await _to_window("redeem:by_ip"),
        "admin": await _to_window("admin:by_ip"),
        "ingest": await _to_window("ingest:by_ip"),
        "resend_ip": await _to_window("resend:by_ip"),
        "resend_email": await _to_window("resend:by_email"),
    }

    cookie_policy = {
        "minLength": 50,
        "requiredKeys": ["__Secure-next-auth.session-token", "oai-did"],
        "notes": "仅作提示；最终校验以后端 fetch_session_via_cookie 结果为准",
    }

    return {"rate_limit_policies": policies, "cookie_policy": cookie_policy}
