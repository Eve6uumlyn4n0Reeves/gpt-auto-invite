"""
外部会话与令牌集成相关路由
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.provider import fetch_session_via_cookie
from app.schemas import ImportCookieIn, ImportCookieOut
from app.config import settings
from app.utils.csrf import require_csrf_token

from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin

router = APIRouter()


@router.post("/import-cookie", response_model=ImportCookieOut)
async def import_cookie_route(
    payload: ImportCookieIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    await require_csrf_token(request)

    try:
        token, expires_at, email, account_id = await run_in_threadpool(fetch_session_via_cookie, payload.cookie)
        if not expires_at:
            try:
                expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
            except Exception:
                expires_at = None
        return ImportCookieOut(
            access_token=token,
            token_expires_at=expires_at,
            user_email=email,
            account_id=account_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"导入失败: {exc}") from exc


__all__ = ["router"]
