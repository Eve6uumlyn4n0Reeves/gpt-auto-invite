from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionUsers
from app.schemas import MotherCreateIn
from app.services.services.admin import create_mother
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit
from app.provider import fetch_session_via_cookie


router = APIRouter(prefix="/api/ingest", tags=["ingest"])


# 自动录入的请求模型
class AutoImportRequest(BaseModel):
    cookie: str
    userInfo: Optional[Dict[str, Any]] = None
    groupId: Optional[int] = None
    customGroupName: Optional[str] = None
    useAutoNaming: bool = True
    timestamp: str
    source: str  # browser-extension, web-page, etc.


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

    db: Session = SessionUsers()
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


@router.post("/auto-import")
async def auto_import_from_browser(
    request: AutoImportRequest,
    _: None = Depends(ingest_rate_limit_dep)
):
    """
    从浏览器自动导入 ChatGPT 账号信息
    无需签名验证，适合浏览器脚本直接调用
    """
    if not settings.ingest_api_enabled:
        raise HTTPException(status_code=503, detail="Ingest API disabled")

    db: Session = SessionUsers()
    try:
        # 1. 验证 Cookie 并获取 session 信息
        access_token, expires_at, email, account_id = fetch_session_via_cookie(request.cookie)

        if not access_token:
            return JSONResponse({
                "success": False,
                "message": "Cookie 无效或已过期",
                "error": "invalid_cookie"
            }, status_code=400)

        # 2. 检查是否已存在相同的账号（以邮箱为唯一名）
        from app.models import MotherAccount
        existing_account = db.query(MotherAccount).filter(
            MotherAccount.name == (email or "")
        ).first()

        if existing_account:
            return JSONResponse({
                "success": True,
                "message": f"账号 {email} 已存在于系统中",
                "data": {
                    "mother_id": existing_account.id,
                    "status": existing_account.status,
                }
            })

        # 3. 创建新的母号记录（名称用邮箱；可选 groupId 归属）
        from app.services.services.admin import create_mother
        mother = create_mother(
            db,
            name=email or (request.customGroupName or f"auto-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}`"),
            access_token=access_token,
            token_expires_at=expires_at,
            teams=[],
            notes=f"auto-import via ingest from {request.source}",
            group_id=request.groupId,
        )

        # 4. 可选：应用命名规则（使用分组模板）
        if request.useAutoNaming and request.groupId:
            try:
                from app.services.services.team_naming import TeamNamingService
                TeamNamingService.apply_naming_to_mother_teams(db, mother.id, None)
                db.refresh(mother)
            except Exception as e:
                # 命名失败不影响主流程
                print(f"Failed to apply team naming: {e}")

        return JSONResponse({
            "success": True,
            "message": f"成功导入账号 {email}",
            "data": {
                "mother_id": mother.id,
                "email": email,
                "team_id": account_id,
                "status": mother.status,
                "group_id": request.groupId,
                "token_expires_at": expires_at.isoformat() if expires_at else None
            }
        })

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Auto import failed: {str(e)}", exc_info=True)

        return JSONResponse({
            "success": False,
            "message": "导入失败",
            "error": str(e)
        }, status_code=500)
    finally:
        db.close()
