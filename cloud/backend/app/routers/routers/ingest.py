from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.schemas import MotherCreateIn
from app.services.services.admin import create_mother
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit


router = APIRouter(prefix="/api/ingest", tags=["ingest"])


async def get_limiter_dep():
    return await get_rate_limiter()


async def ingest_rate_limit_dep(request: Request, limiter = Depends(get_limiter_dep)):
    dependency = rate_limit(limiter, ip_strategy, config_id="ingest:by_ip")
    await dependency(request)


def _verify_signature(method: str, path: str, ts: str, body: bytes, provided: str) -> bool:
    if not settings.ingest_api_key:
        return False
    # body sha256 hex
    body_hash = hashlib.sha256(body or b"{}").hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode("utf-8")
    secret = settings.ingest_api_key.encode("utf-8")
    sig = hmac.new(secret, msg, hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(sig, provided.lower())
    except Exception:
        return False


@router.post("/mothers")
async def ingest_mother(request: Request, _: None = Depends(ingest_rate_limit_dep)):
    if not settings.ingest_api_enabled or not settings.ingest_api_key:
        raise HTTPException(status_code=503, detail="Ingest API disabled")

    ts = request.headers.get("X-Ingest-Ts")
    sign = request.headers.get("X-Ingest-Sign")
    if not ts or not sign:
        raise HTTPException(status_code=401, detail="Missing signature headers")
    try:
        ts_int = int(ts)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid timestamp header")
    now = int(time.time())
    if abs(now - ts_int) > 300:
        raise HTTPException(status_code=401, detail="Timestamp expired")

    raw = await request.body()
    if not _verify_signature(request.method.upper(), request.url.path, ts, raw, sign):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = MotherCreateIn.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}")

    db: Session = SessionLocal()
    try:
        mother = create_mother(
            db,
            name=payload.name,
            access_token=payload.access_token,
            token_expires_at=payload.token_expires_at,
            teams=[t.model_dump() for t in payload.teams],
            notes=payload.notes,
        )
        return JSONResponse({"ok": True, "mother_id": mother.id})
    finally:
        db.close()

