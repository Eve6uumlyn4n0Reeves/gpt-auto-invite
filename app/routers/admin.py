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
from app.security import verify_password, hash_password, sign_session, verify_session, unsign_session
from app.provider import fetch_session_via_cookie
from app.services.admin import create_or_update_admin_default, list_mothers_with_usage, create_mother
from app.services.redeem import generate_codes
from app.services.invites import resend_invite, cancel_invite, remove_member
from app.config import settings
from app.services import audit as audit_svc
from app.utils.rate_limit import SimpleRateLimiter
from app.services.maintenance import cleanup_stale_held


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


# basic rate limiters for sensitive ops
login_rl = SimpleRateLimiter(10, 60)
admin_ops_rl = SimpleRateLimiter(60, 60)


@router.post("/login")
def admin_login(payload: AdminLoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "_"
    if not login_rl.allow(f"login:{ip}"):
        raise HTTPException(status_code=429, detail="尝试过于频繁")
    row = db.query(models.AdminConfig).first()
    if not row:
        # bootstrap with initial password
        create_or_update_admin_default(db, hash_password(settings.admin_initial_password))
        row = db.query(models.AdminConfig).first()
    if not verify_password(payload.password, row.password_hash):
        raise HTTPException(status_code=401, detail="密码错误")
    # create server-side session
    import uuid
    from datetime import datetime, timedelta
    sid = uuid.uuid4().hex
    expires_at = datetime.utcnow() + __import__("datetime").timedelta(seconds=settings.admin_session_ttl_seconds)
    db.add(models.AdminSession(session_id=sid, expires_at=expires_at, ip=request.client.host if request.client else None, ua=request.headers.get('user-agent')))
    db.commit()
    token = sign_session(sid)
    cookie_kwargs = {"httponly": True}
    # Strengthen cookie in production
    if settings.env in ("prod", "production"):
        cookie_kwargs.update({"secure": True, "samesite": "strict"})
    else:
        cookie_kwargs.update({"samesite": "lax"})
    response.set_cookie("admin_session", token, **cookie_kwargs)
    audit_svc.log(db, actor="admin", action="login", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
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
    # revoke all sessions
    q = db.query(models.AdminSession).filter(models.AdminSession.revoked == False)  # noqa: E712
    for row in q.all():
        row.revoked = True
        db.add(row)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=AdminMeOut)
def admin_me(request: Request):
    sess = request.cookies.get("admin_session")
    return AdminMeOut(authenticated=bool(sess and verify_session(sess, max_age_seconds=settings.admin_session_ttl_seconds)))


@router.post("/mothers/import-cookie", response_model=ImportCookieOut)
def mothers_import_cookie(req: ImportCookieIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    token, exp, email, account_id = fetch_session_via_cookie(req.cookie)
    audit_svc.log(db, actor="admin", action="import_cookie", payload_redacted=f"user={email}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return ImportCookieOut(access_token=token, token_expires_at=exp, user_email=email, account_id=account_id)


@router.post("/mothers/import-access-token", response_model=ImportCookieOut)
def mothers_import_access_token(req: ImportAccessTokenIn, request: Request):
    require_admin(request)
    # Just echo back as normalized structure; validation can be deferred to when saving mother or via self-check
    return ImportCookieOut(access_token=req.access_token, token_expires_at=req.token_expires_at, user_email=req.user_email, account_id=req.account_id)


@router.post("/mothers")
def mothers_create(req: MotherCreateIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    mother = create_mother(db, req.name, req.access_token, req.token_expires_at, [t.dict() for t in req.teams], req.notes)
    audit_svc.log(db, actor="admin", action="create_mother", target_type="mother", target_id=str(mother.id), payload_redacted=f"name={req.name}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"id": mother.id}


@router.get("/mothers")
def mothers_list(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return list_mothers_with_usage(db)


@router.post("/mothers/{mother_id}/teams")
def mothers_update_teams(mother_id: int, req: MotherTeamsUpdateIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    mother = db.get(models.MotherAccount, mother_id)
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")
    # ensure single default
    default_set = False
    desired = []
    for t in req.teams:
        is_def = bool(t.is_default) and not default_set
        if is_def:
            default_set = True
        desired.append({
            'team_id': t.team_id,
            'team_name': t.team_name,
            'is_enabled': bool(t.is_enabled),
            'is_default': is_def,
        })
    # Upsert by team_id
    existing = {t.team_id: t for t in mother.teams}
    seen = set()
    for d in desired:
        seen.add(d['team_id'])
        if d['team_id'] in existing:
            et = existing[d['team_id']]
            et.team_name = d['team_name']
            et.is_enabled = d['is_enabled']
            et.is_default = d['is_default']
            db.add(et)
        else:
            db.add(models.MotherTeam(
                mother_id=mother.id,
                team_id=d['team_id'],
                team_name=d['team_name'],
                is_enabled=d['is_enabled'],
                is_default=d['is_default'],
            ))
    # remove teams not in desired
    for t in list(mother.teams):
        if t.team_id not in seen:
            db.delete(t)
    db.commit()
    audit_svc.log(db, actor="admin", action="update_mother_teams", target_type="mother", target_id=str(mother.id), payload_redacted=f"teams={len(desired)}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"ok": True}


@router.post("/change-password")
def admin_change_password(req: AdminChangePasswordIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    row = db.query(models.AdminConfig).first()
    if not row or not verify_password(req.old_password, row.password_hash):
        raise HTTPException(status_code=401, detail="旧密码错误")
    row.password_hash = hash_password(req.new_password)
    db.add(row)
    # revoke all sessions after password change
    for s in db.query(models.AdminSession).all():
        s.revoked = True
        db.add(s)
    db.commit()
    audit_svc.log(db, actor="admin", action="change_password", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"ok": True}


@router.post("/codes/batch", response_model=BatchCodesOut)
def codes_batch(req: BatchCodesIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    batch_id, codes = generate_codes(db, req.count, req.prefix, req.expires_at, req.batch_id)
    audit_svc.log(db, actor="admin", action="codes_batch", target_type="batch", target_id=batch_id, payload_redacted=f"count={req.count}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return BatchCodesOut(batch_id=batch_id, codes=codes)


@router.post("/invites/resend")
def admin_resend(req: ResendIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"resend:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")
    email = (req.email or "").strip().lower()
    ok, msg = resend_invite(db, email, req.team_id)
    audit_svc.log(db, actor="admin", action="resend_invite", target_type="team", target_id=req.team_id, payload_redacted=f"email={mask(req.email)} ok={ok}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"success": ok, "message": msg}


@router.post("/invites/cancel")
def admin_cancel(req: CancelInviteIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"cancel:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")
    email = (req.email or "").strip().lower()
    ok, msg = cancel_invite(db, email, req.team_id)
    audit_svc.log(db, actor="admin", action="cancel_invite", target_type="team", target_id=req.team_id, payload_redacted=f"email={mask(req.email)} ok={ok}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"success": ok, "message": msg}


@router.post("/members/remove")
def admin_remove(req: RemoveMemberIn, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    ip = request.client.host if request.client else "_"
    if not admin_ops_rl.allow(f"remove:{ip}"):
        raise HTTPException(status_code=429, detail="操作过于频繁")
    email = (req.email or "").strip().lower()
    ok, msg = remove_member(db, email, req.team_id)
    audit_svc.log(db, actor="admin", action="remove_member", target_type="team", target_id=req.team_id, payload_redacted=f"email={mask(req.email)} ok={ok}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"success": ok, "message": msg}


@router.post("/maintenance/cleanup_held")
def maintenance_cleanup_held(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    count = cleanup_stale_held(db)
    return {"released": count}


@router.get("/mothers/{mother_id}/slots")
def mother_slots(mother_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    slots = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.mother_id == mother_id)
        .order_by(models.SeatAllocation.slot_index.asc())
        .all()
    )
    return [
        {
            "slot_index": s.slot_index,
            "status": s.status.value,
            "team_id": s.team_id,
            "email": s.email,
            "held_until": s.held_until,
            "invite_request_id": s.invite_request_id,
            "invite_id": s.invite_id,
            "member_id": s.member_id,
        }
        for s in slots
    ]


@router.post("/mothers/{mother_id}/slots/{slot_index}/force_free")
def mother_slot_force_free(mother_id: int, slot_index: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    seat = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.mother_id == mother_id, models.SeatAllocation.slot_index == slot_index)
        .first()
    )
    if not seat:
        raise HTTPException(status_code=404, detail="槽位不存在")
    seat.status = models.SeatStatus.free
    seat.held_until = None
    seat.team_id = None
    seat.email = None
    seat.invite_request_id = None
    seat.invite_id = None
    db.add(seat)
    db.commit()
    audit_svc.log(db, actor="admin", action="force_free_slot", target_type="mother", target_id=str(mother_id), payload_redacted=f"slot={slot_index}", ip=request.client.host if request.client else None, ua=request.headers.get('user-agent'))
    return {"ok": True}


@router.post("/mothers/{mother_id}/selfcheck")
def mother_selfcheck(mother_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    mother = db.get(models.MotherAccount, mother_id)
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")
    # pick an enabled team
    team = next((t for t in mother.teams if t.is_enabled), None)
    if not team:
        return {"ok": False, "message": "无启用团队"}
    from app.security import decrypt_token
    from app import provider
    token = decrypt_token(mother.access_token_enc)
    try:
        provider.list_members(token, team.team_id)
        return {"ok": True}
    except provider.ProviderError as e:
        if e.status in (401, 403):
            mother.status = models.MotherStatus.invalid
            db.add(mother)
            db.commit()
        return {"ok": False, "status": e.status, "code": e.code}


def mask(email: str) -> str:
    try:
        name, domain = email.split('@', 1)
        return (name[:2] + '***') + '@' + domain
    except Exception:
        return '***'
