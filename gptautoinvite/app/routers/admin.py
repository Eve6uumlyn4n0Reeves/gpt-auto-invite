from fastapi import APIRouter, Depends, Request, Response, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.schemas import (
    ImportCookieIn,
    ImportCookieOut,
    MotherCreateIn,
    BatchCodesIn,
    BatchCodesOut,
    AdminLoginIn,
    AdminMeOut,
    CancelInviteIn,
    RemoveMemberIn,
    ImportAccessTokenIn,
    ResendIn,
    AdminChangePasswordIn,
    MotherTeamsUpdateIn,
)
from app.security import (
    verify_password,
    verify_admin_password,
    hash_password,
    sign_session,
    verify_session,
    unsign_session,
    check_login_attempts,
    get_lockout_remaining,
    record_login_attempt,
    get_security_headers,
)
from app.provider import fetch_session_via_cookie
from app.services.admin import create_or_update_admin_default, list_mothers_with_usage, create_mother
from app.services.redeem import generate_codes
from app.services.invites import resend_invite, cancel_invite, remove_member
from app.config import settings
from app.services import audit as audit_svc
from app.utils.rate_limit import SimpleRateLimiter

router = APIRouter(prefix="/api/admin", tags=["admin"])


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


# 基础限流
login_rl = SimpleRateLimiter(10, 60)
admin_ops_rl = SimpleRateLimiter(60, 60)


@router.post("/login")
def admin_login(payload: AdminLoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "_"

    if not check_login_attempts(ip):
        remaining = get_lockout_remaining(ip)
        raise HTTPException(status_code=429, detail=f"登录尝试过多，请等待 {remaining} 秒后重试")

    if not login_rl.allow(f"login:{ip}"):
        raise HTTPException(status_code=429, detail="尝试过于频繁")

    row = db.query(models.AdminConfig).first()
    if not row:
        # 首次启动：用初始密码引导
        create_or_update_admin_default(db, hash_password(settings.admin_initial_password))
        row = db.query(models.AdminConfig).first()

    if not verify_admin_password(payload.password, row.password_hash):
        record_login_attempt(ip, False)
        raise HTTPException(status_code=401, detail="密码错误")

    record_login_attempt(ip, True)

    # 创建服务端会话
    import uuid
    from datetime import datetime, timedelta

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
    cookie_kwargs = {"httponly": True}
    if settings.env in ("prod", "production"):
        cookie_kwargs.update({"secure": True, "samesite": "strict"})
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
    return {"ok": True}


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

    response.delete_cookie("admin_session")
    return {"ok": True}


@router.post("/logout-all")
def admin_logout_all(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    # 撤销全部会话
    q = db.query(models.AdminSession).filter(models.AdminSession.revoked == False)  # noqa: E712
    for row in q.all():
        row.revoked = True
        db.add(row)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=AdminMeOut)
def admin_me(request: Request, db: Session = Depends(get_db)):
    sess = request.cookies.get("admin_session")
    if not sess or not verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds):
        return AdminMeOut(authenticated=False)

    sid = unsign_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)
    if not sid:
        return AdminMeOut(authenticated=False)

    row = db.query(models.AdminSession).filter(models.AdminSession.session_id == sid).first()
    now = __import__("datetime").datetime.utcnow()
    if not row or row.revoked or row.expires_at <= now:
        return AdminMeOut(authenticated=False)

    return AdminMeOut(authenticated=True)


@router.post("/import-cookie", response_model=ImportCookieOut)
def import_cookie(payload: ImportCookieIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"import:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    try:
        token, expires_at, email, account_id = fetch_session_via_cookie(payload.cookie)
        return ImportCookieOut(
            access_token=token,
            token_expires_at=expires_at,
            user_email=email,
            account_id=account_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"导入失败: {e}")


@router.post("/mothers")
def create_mother_account(payload: MotherCreateIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"create_mother:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    try:
        mother = create_mother(
            db,
            payload.name,
            payload.access_token,
            payload.token_expires_at,
            [t.dict() for t in payload.teams],
            payload.notes,
        )
        audit_svc.log(db, actor="admin", action="create_mother", target_type="mother", target_id=str(mother.id))
        return {"ok": True, "mother_id": mother.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"创建失败: {e}")


@router.get("/mothers")
def list_mothers(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return list_mothers_with_usage(db)


@router.post("/codes", response_model=BatchCodesOut)
def generate_batch_codes(payload: BatchCodesIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"gen_codes:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    # 配额限制：每个启用团队可生成 7 个有效未过期兑换码
    now = __import__("datetime").datetime.utcnow()
    enabled_teams = db.query(models.MotherTeam).filter(models.MotherTeam.is_enabled == True).count()  # noqa: E712
    capacity = enabled_teams * 7
    active_codes = (
        db.query(models.RedeemCode)
        .filter(
            models.RedeemCode.status == models.CodeStatus.unused,
            ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
        )
        .count()
    )
    remaining = max(0, capacity - active_codes)
    if payload.count > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"数量超出配额：当前可生成 {remaining} 个；已启用团队 {enabled_teams} 个（总容量 {capacity}）",
        )

    batch_id, codes = generate_codes(db, payload.count, payload.prefix, payload.expires_at, payload.batch_id)
    audit_svc.log(db, actor="admin", action="generate_codes", payload_redacted=f"count={payload.count}, batch={batch_id}")

    after_active = active_codes + len(codes)
    return BatchCodesOut(
        batch_id=batch_id,
        codes=codes,
        enabled_teams=enabled_teams,
        max_code_capacity=capacity,
        active_codes=after_active,
        remaining_quota=max(0, capacity - after_active),
    )


@router.post("/resend")
def admin_resend_invite(payload: ResendIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"resend:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    if not payload.team_id:
        raise HTTPException(status_code=400, detail="缺少 team_id")

    ok, msg = resend_invite(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/cancel-invite")
def admin_cancel_invite(payload: CancelInviteIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"cancel_invite:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    ok, msg = cancel_invite(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/remove-member")
def admin_remove_member(payload: RemoveMemberIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"remove_member:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    ok, msg = remove_member(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/change-password")
def admin_change_password(payload: AdminChangePasswordIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"change_pwd:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    row = db.query(models.AdminConfig).first()
    if not row or not verify_password(payload.old_password, row.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")

    row.password_hash = hash_password(payload.new_password)
    db.add(row)
    db.commit()

    audit_svc.log(db, actor="admin", action="change_password")
    return {"ok": True}


@router.get("/users")
def list_users(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)

    users = db.query(models.InviteRequest).all()
    result = []

    for user in users:
        code_used = None
        if user.code_id:
            code = db.query(models.RedeemCode).filter(models.RedeemCode.id == user.code_id).first()
            if code:
                code_used = code.code_hash

        team_name = None
        if user.team_id:
            team = db.query(models.MotherTeam).filter(models.MotherTeam.team_id == user.team_id).first()
            if team:
                team_name = team.team_name

        result.append(
            {
                "id": user.id,
                "email": user.email,
                "status": user.status.value,
                "team_id": user.team_id,
                "team_name": team_name,
                "invited_at": user.created_at.isoformat() if user.created_at else None,
                "redeemed_at": user.updated_at.isoformat() if user.status == models.InviteStatus.sent and user.updated_at else None,
                "code_used": code_used,
            }
        )

    return result


@router.get("/codes")
def list_codes(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)

    codes = db.query(models.RedeemCode).order_by(models.RedeemCode.created_at.desc()).all()
    result = []

    for code in codes:
        user = db.query(models.InviteRequest).filter(models.InviteRequest.code_id == code.id).first()

        result.append(
            {
                "id": code.id,
                "code": code.code,
                "batch_id": code.batch_id,
                "is_used": code.is_used,
                "expires_at": code.expires_at.isoformat() if code.expires_at else None,
                "created_at": code.created_at.isoformat() if code.created_at else None,
                "used_by": user.email if user else None,
                "used_at": user.updated_at.isoformat() if user and code.is_used else None,
            }
        )

    return result


@router.post("/codes/{code_id}/disable")
def disable_code(code_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"disable_code:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    code = db.query(models.RedeemCode).filter(models.RedeemCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="兑换码不存在")

    if code.is_used:
        raise HTTPException(status_code=400, detail="已使用的兑换码无法禁用")

    # 设置过期时间为当前来禁用
    code.expires_at = __import__("datetime").datetime.utcnow()
    db.add(code)
    db.commit()

    audit_svc.log(db, actor="admin", action="disable_code", target_type="code", target_id=str(code_id))
    return {"ok": True, "message": "兑换码已禁用"}


@router.get("/audit-logs")
def list_audit_logs(request: Request, db: Session = Depends(get_db), limit: int = 100, offset: int = 0):
    require_admin(request, db)

    logs = (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .offset(offset)
        .limit(min(limit, 1000))
        .all()
    )

    result = []
    for log in logs:
        result.append(
            {
                "id": log.id,
                "actor": log.actor,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "payload_redacted": log.payload_redacted,
                "ip": log.ip,
                "ua": log.ua,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
        )

    return result


@router.put("/mothers/{mother_id}")
def update_mother(mother_id: int, payload: MotherCreateIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"update_mother:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    mother = db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    # 更新基本信息
    mother.name = payload.name
    mother.notes = payload.notes

    # 更新访问令牌（若提供）
    if payload.access_token:
        from app.security import encrypt_token

        mother.access_token_enc = encrypt_token(payload.access_token)
        mother.token_expires_at = payload.token_expires_at

    # 更新团队：先删后加，保证默认团队唯一
    db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()

    default_set = False
    for t in payload.teams:
        is_def = bool(t.is_default) and not default_set
        if is_def:
            default_set = True
        db.add(
            models.MotherTeam(
                mother_id=mother_id,
                team_id=t.team_id,
                team_name=t.team_name,
                is_enabled=bool(t.is_enabled),
                is_default=is_def,
            )
        )

    db.add(mother)
    db.commit()

    audit_svc.log(db, actor="admin", action="update_mother", target_type="mother", target_id=str(mother_id))
    return {"ok": True, "message": "母号更新成功"}


@router.delete("/mothers/{mother_id}")
def delete_mother(mother_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"delete_mother:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")

    mother = db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    used_seats = db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

    if used_seats > 0:
        raise HTTPException(status_code=400, detail=f"无法删除：该母号仍有 {used_seats} 个座位在使用")

    db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()
    db.query(models.SeatAllocation).filter(models.SeatAllocation.mother_id == mother_id).delete()
    db.delete(mother)
    db.commit()

    audit_svc.log(db, actor="admin", action="delete_mother", target_type="mother", target_id=str(mother_id))
    return {"ok": True, "message": "母号删除成功"}

