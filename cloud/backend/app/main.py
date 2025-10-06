from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.database import init_db
from app.routers import public as public_router
from app.routers import admin as admin_router
from app.routers import stats as stats_router
from app.routers import metrics as metrics_router
from pathlib import Path
from app.config import settings
from app.security import hash_password
from app import models
from app.database import SessionLocal
import threading, time, logging
from app.services.maintenance import cleanup_stale_held

init_db()

app = FastAPI(title="GPT Team Auto Invite Service")

app.include_router(public_router.router)
app.include_router(admin_router.router)
app.include_router(stats_router.router)
app.include_router(metrics_router.router)

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
