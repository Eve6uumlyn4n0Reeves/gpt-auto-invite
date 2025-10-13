from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from app.database import init_db
from app.routers.routers import public as public_router
from app.routers.routers import admin as admin_router
from app.routers.routers import stats as stats_router
from app.routers.routers import metrics as metrics_router
from app.routers.routers import rate_limit as rate_limit_router
from pathlib import Path
from app.config import settings
from app.security import hash_password
from app import models
from app.database import SessionLocal
from app.middleware import SecurityHeadersMiddleware, CSRFMiddleware, InputValidationMiddleware
import threading, time, logging
from app.services.services.maintenance import cleanup_stale_held
from app.services.services.rate_limiter_service import init_rate_limiter, close_rate_limiter

init_db()

app = FastAPI(title="GPT Team Auto Invite Service")

# 启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化限流器"""
    await init_rate_limiter()
    logging.info("Rate limiter initialized")

# 关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    await close_rate_limiter()
    logging.info("Rate limiter cleaned up")

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
])

# 添加安全头部中间件
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(public_router.router)
app.include_router(admin_router.router)
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

# background task to cleanup stale held seats
def _cleanup_loop():
    while True:
        try:
            db = SessionLocal()
            count = cleanup_stale_held(db)
            db.close()
        except Exception:
            logging.exception("cleanup_stale_held loop error")
        time.sleep(60)  # every 60 seconds for faster seat recycle

logging.basicConfig(level=logging.INFO)
t = threading.Thread(target=_cleanup_loop, daemon=True)
t.start()
