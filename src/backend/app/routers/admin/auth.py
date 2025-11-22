"""
管理员认证与会话相关路由
"""
from datetime import datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.schemas import AdminChangePasswordIn, AdminLoginIn, AdminMeOut
from app.security import (
    check_login_attempts,
    get_lockout_remaining,
    get_security_headers,
    hash_password,
    record_login_attempt,
    sign_session,
    unsign_session,
    verify_password,
    verify_admin_password,
    verify_session,
)
from app.services.services import audit as audit_svc
from app.services.services.admin_service import create_or_update_admin_default
from app.utils.csrf import generate_csrf_token_for_session

from .dependencies import (
    admin_login_rate_limit_dep,
    admin_ops_rate_limit_dep,
    get_db,
    require_admin,
)

router = APIRouter()


@router.post("/login")
async def admin_login(
    payload: AdminLoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _: None = Depends(admin_login_rate_limit_dep),
):
    """管理员登录 - 限流：每分钟100次（按IP）"""
    ip = request.client.host if request.client else "_"

    if not check_login_attempts(ip):
        remaining = get_lockout_remaining(ip)
        raise HTTPException(status_code=429, detail=f"登录尝试过多，请等待 {remaining} 秒后重试")

    # 管理员记录在应用启动阶段初始化；此处不再隐式创建
    row = db.query(models.AdminConfig).first()
    if not row:
        # 测试环境兜底：如果启动时未成功创建默认管理员，这里补一次
        try:
            create_or_update_admin_default(db, hash_password(settings.admin_initial_password))
            row = db.query(models.AdminConfig).first()
        except Exception:
            row = None
    
    if not verify_admin_password(payload.password, row.password_hash):
        record_login_attempt(ip, False)
        raise HTTPException(status_code=401, detail="密码错误")

    record_login_attempt(ip, True)

    sid = uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(seconds=settings.admin_session_ttl_seconds)
    db.add(
        models.AdminSession(
            session_id=sid,
            expires_at=expires_at,
            ip=request.client.host if request.client else None,
            ua=request.headers.get("user-agent"),
        )
    )
    db.commit()

    token = sign_session(sid)
    cookie_kwargs = {
        "httponly": True,
        "path": "/",
        "max_age": settings.admin_session_ttl_seconds,
    }

    if settings.env in ("prod", "production"):
        cookie_kwargs.update(
            {
                "secure": True,
                "samesite": "strict",
                "domain": f".{settings.domain}" if settings.domain != "localhost" else None,
            }
        )
    else:
        cookie_kwargs.update({"samesite": "lax"})

    response.set_cookie("admin_session", token, **cookie_kwargs)

    for header, value in get_security_headers().items():
        response.headers[header] = value

    audit_svc.log(
        db,
        actor="admin",
        action="login",
        ip=request.client.host if request.client else None,
        ua=request.headers.get("user-agent"),
    )
    return {"success": True, "message": "登录成功"}


@router.post("/logout")
def admin_logout(request: Request, response: Response, db: Session = Depends(get_db)):
    sess = request.cookies.get("admin_session")
    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds) if sess else None
    if sid:
        row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
        if row:
            row.revoked = True
            db.add(row)
            db.commit()

    delete_kwargs = {"path": "/", "httponly": True}
    if settings.env in ("prod", "production"):
        delete_kwargs.update(
            {
                "secure": True,
                "samesite": "strict",
                "domain": f".{settings.domain}" if settings.domain != "localhost" else None,
            }
        )
    else:
        delete_kwargs.update({"samesite": "lax"})

    response.delete_cookie("admin_session", **delete_kwargs)
    return {"success": True, "message": "已退出登录"}


@router.post("/logout-all")
def admin_logout_all(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)

    q = db.query(models.AdminSession).filter(models.AdminSession.revoked == False)  # noqa: E712
    count = 0
    for row in q.all():
        row.revoked = True
        db.add(row)
        count += 1
    db.commit()
    return {"success": True, "message": f"已撤销 {count} 个会话"}


@router.get("/me", response_model=AdminMeOut)
def admin_me(request: Request, db: Session = Depends(get_db)):
    sess = request.cookies.get("admin_session")
    if not sess or not verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds):
        return AdminMeOut(authenticated=False)

    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)
    if not sid:
        return AdminMeOut(authenticated=False)

    row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
    now = datetime.utcnow()
    if not row or row.revoked or row.expires_at <= now:
        return AdminMeOut(authenticated=False)

    return AdminMeOut(authenticated=True)


@router.get("/csrf-token")
def get_csrf_token(request: Request, db: Session = Depends(get_db)):
    sess = request.cookies.get("admin_session")
    if not sess or not verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds):
        raise HTTPException(status_code=401, detail="未认证")

    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)
    if not sid:
        raise HTTPException(status_code=401, detail="未认证")

    row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
    now = datetime.utcnow()
    if not row or row.revoked or row.expires_at <= now:
        raise HTTPException(status_code=401, detail="未认证")

    csrf_token = generate_csrf_token_for_session(sid)
    return {"csrf_token": csrf_token}


@router.post("/change-password")
def admin_change_password(
    payload: AdminChangePasswordIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    row = db.query(models.AdminConfig).first()
    # 支持通过备用口令(EXTRA_PASSWORD/EXTRA_PASSWORD_HASH)进行主口令轮换
    if not row or not verify_admin_password(payload.old_password, row.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")

    row.password_hash = hash_password(payload.new_password)
    db.add(row)
    db.commit()

    audit_svc.log(db, actor="admin", action="change_password")
    return {"ok": True}
