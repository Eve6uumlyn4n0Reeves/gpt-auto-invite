import asyncio
import logging
import contextlib
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from app.database import init_db, SessionLocal
from app.routers.routers import public as public_router
from app.routers.admin import router as admin_router
from app.routers.routers import stats as stats_router
from app.routers.routers import metrics as metrics_router
from app.routers.routers import rate_limit as rate_limit_router
from app.config import settings
from app.middleware import SecurityHeadersMiddleware, CSRFMiddleware, InputValidationMiddleware
from app.services.services.maintenance import cleanup_stale_held, cleanup_expired_mother_teams
from app.services.services.rate_limiter_service import init_rate_limiter, close_rate_limiter

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """管理应用生命周期，替代旧式 startup/shutdown 事件。"""
    init_db()
    await init_rate_limiter()
    logging.info("Rate limiter initialized")

    stop_event = asyncio.Event()
    maintenance_task: Optional[asyncio.Task] = None

    def _run_maintenance_once():
        """执行一次维护循环（同步函数，供线程池调用）。"""
        db = SessionLocal()
        try:
            freed = cleanup_stale_held(db)
            if freed:
                logging.info("cleanup_stale_held: freed %s seats", freed)

            deleted = cleanup_expired_mother_teams(db)
            if deleted:
                logging.info("cleanup_expired_mother_teams: deleted %s teams", deleted)
        finally:
            db.close()

    async def _maintenance_worker():
        """定期清理过期座位与母号数据。"""
        backoff = 5.0
        while not stop_event.is_set():
            try:
                await asyncio.to_thread(_run_maintenance_once)
                backoff = 5.0
            except Exception:
                logging.exception("maintenance loop error")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 300.0)
                continue

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=60.0)
            except asyncio.TimeoutError:
                continue

    maintenance_task = asyncio.create_task(_maintenance_worker())

    try:
        yield
    finally:
        stop_event.set()
        if maintenance_task:
            maintenance_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await maintenance_task
        await close_rate_limiter()
        logging.info("Rate limiter cleaned up")


app = FastAPI(title="GPT Team Auto Invite Service", lifespan=lifespan)

# 添加安全中间件
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"] if settings.env == "dev" else [settings.domain])

# 添加输入验证中间件
app.add_middleware(InputValidationMiddleware)

# 添加CSRF防护中间件，排除公开API路径
app.add_middleware(CSRFMiddleware, excluded_paths=[
    "/api/public/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc"
], allowed_origins=settings.csrf_allowed_origins)

# 添加安全头部中间件
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(public_router.router)
app.include_router(admin_router)
app.include_router(stats_router.router)
app.include_router(metrics_router.router)
app.include_router(rate_limit_router.router)


@app.get("/health")
def health():
    return JSONResponse({"ok": True})

# Production safety checks
if settings.env in ("prod", "production"):
    if not settings.encryption_key_b64 or settings.secret_key == "change-me-secret-key":
        raise RuntimeError("In production, ENCRYPTION_KEY and SECRET_KEY must be set.")
    if settings.admin_initial_password == "admin":
        raise RuntimeError("In production, ADMIN_INITIAL_PASSWORD must not be the default 'admin'.")
    if settings.extra_password:
        raise RuntimeError("In production, EXTRA_PASSWORD is not allowed.")
