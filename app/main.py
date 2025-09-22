from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
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

static_dir = Path(__file__).resolve().parent / "static"
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))

app.include_router(public_router.router)
app.include_router(admin_router.router)
app.include_router(stats_router.router)
app.include_router(metrics_router.router)

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return RedirectResponse(url="/redeem")


@app.get("/redeem", response_class=HTMLResponse)
def redeem_page(request: Request):
    return templates.TemplateResponse("redeem.html", {"request": request})


@app.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request})

# Production safety checks
if settings.env in ("prod", "production"):
    if not settings.encryption_key_b64 or settings.secret_key == "change-me-secret-key":
        raise RuntimeError("In production, ENCRYPTION_KEY and SECRET_KEY must be set.")


# background task to cleanup stale held seats
def _cleanup_loop():
    while True:
        try:
            db = SessionLocal()
            count = cleanup_stale_held(db)
            db.close()
        except Exception:
            logging.exception("cleanup_stale_held loop error")
        time.sleep(300)  # every 5 minutes


logging.basicConfig(level=logging.INFO)
t = threading.Thread(target=_cleanup_loop, daemon=True)
t.start()
