import json
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
    BatchOpIn,
    BatchOpOut,
    BatchOperationSupportedActions,
    MotherBatchItemIn,
    MotherBatchValidateItemOut,
    MotherBatchImportItemResult,
    MotherTeamIn,
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
from app.utils.csrf import generate_csrf_token_for_session, require_csrf_token
from app.provider import fetch_session_via_cookie
from app.services.services.admin import create_or_update_admin_default, list_mothers_with_usage, create_mother
from app.services.services.redeem import generate_codes
from app.services.services.invites import resend_invite, cancel_invite, remove_member
from app.config import settings
from app.services.services import audit as audit_svc
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.services.services.bulk_history import record_bulk_operation
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit
from app.utils.performance import monitor_session_queries, query_monitor, log_performance_summary

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


async def get_admin_rate_limiter():
    """获取管理员限流器"""
    return await get_rate_limiter()


async def admin_login_rate_limit_dep(request: Request, limiter = Depends(get_admin_rate_limiter)):
    """管理员登录限流依赖"""
    return rate_limit(limiter, ip_strategy, config_id="admin:by_ip")(request)


async def admin_ops_rate_limit_dep(request: Request, limiter = Depends(get_admin_rate_limiter)):
    """管理员操作限流依赖"""
    return rate_limit(limiter, ip_strategy, config_id="admin:by_ip")(request)


@router.post("/login")
async def admin_login(
    payload: AdminLoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    _: None = Depends(admin_login_rate_limit_dep)
):
    """管理员登录 - 限流：每分钟100次（按IP）"""
    ip = request.client.host if request.client else "_"

    if not check_login_attempts(ip):
        remaining = get_lockout_remaining(ip)
        raise HTTPException(status_code=429, detail=f"登录尝试过多，请等待 {remaining} 秒后重试")

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
    cookie_kwargs = {
        "httponly": True,
        "path": "/",
        "max_age": settings.admin_session_ttl_seconds,
    }

    if settings.env in ("prod", "production"):
        cookie_kwargs.update({
            "secure": True,
            "samesite": "strict",
            "domain": f".{settings.domain}" if settings.domain != "localhost" else None
        })
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


@router.post("/mothers/batch/import-text")
async def batch_mothers_import_text(request: Request, db: Session = Depends(get_db), delim: str = "---"):
    """以纯文本批量导入母号，每行格式：email---accessToken
    - Content-Type: text/plain; charset=utf-8
    - 可通过 query 参数 `delim` 修改分隔符（默认 '---'）
    - 不设置团队（可在后台后续编辑）
    返回：[{ index, success, mother_id?, error? }]
    """
    require_admin(request, db)
    body_bytes = await request.body()
    try:
        text = body_bytes.decode("utf-8", errors="ignore")
    except Exception:
        text = body_bytes.decode(errors="ignore")

    results = []
    lines = [s.strip() for s in text.splitlines() if s.strip()]
    for i, line in enumerate(lines):
        try:
            parts = line.split(delim)
            if len(parts) < 2:
                # 兼容空格分隔
                sp = line.split()
                if len(sp) >= 2:
                    parts = [sp[0], " ".join(sp[1:])]
            email = (parts[0] or "").strip()
            token = (parts[1] or "").strip()
            if not email or not token:
                raise ValueError("格式错误：缺少邮箱或Token")

            mother = create_mother(
                db,
                name=email,
                access_token=token,
                token_expires_at=None,
                teams=[],
                notes=None,
            )
            results.append({"index": i, "success": True, "mother_id": mother.id})
        except Exception as e:
            results.append({"index": i, "success": False, "error": str(e)})

    try:
        success_count = sum(1 for item in results if item.get("success"))
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.mother_import_text,
            actor="admin",
            total_count=len(results),
            success_count=success_count,
            failed_count=len(results) - success_count,
            metadata={
                "delimiter": delim,
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass

    return results


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

    # 安全删除cookie，包含所有必要的属性
    delete_kwargs = {"path": "/", "httponly": True}
    if settings.env in ("prod", "production"):
        delete_kwargs.update({
            "secure": True,
            "samesite": "strict",
            "domain": f".{settings.domain}" if settings.domain != "localhost" else None
        })
    else:
        delete_kwargs.update({"samesite": "lax"})

    response.delete_cookie("admin_session", **delete_kwargs)
    return {"success": True, "message": "已退出登录"}


@router.post("/logout-all")
def admin_logout_all(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    # 撤销全部会话
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
    now = __import__("datetime").datetime.utcnow()
    if not row or row.revoked or row.expires_at <= now:
        return AdminMeOut(authenticated=False)

    return AdminMeOut(authenticated=True)


@router.get("/csrf-token")
def get_csrf_token(request: Request, db: Session = Depends(get_db)):
    """获取CSRF token"""
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

    # 生成CSRF token
    csrf_token = generate_csrf_token_for_session(sid)

    return {"csrf_token": csrf_token}


@router.post("/import-cookie", response_model=ImportCookieOut)
async def import_cookie(
    payload: ImportCookieIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep)
):
    require_admin(request, db)
    require_csrf_token(request)

    try:
        from datetime import datetime, timedelta
        from app.config import settings
        token, expires_at, email, account_id = fetch_session_via_cookie(payload.cookie)
        # 若上游未给出过期时间，这里也进行一次 40 天回退，确保前端显示
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"导入失败: {e}")


@router.post("/mothers")
async def create_mother_account(
    payload: MotherCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep)
):
    require_admin(request, db)
    require_csrf_token(request)

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
async def generate_batch_codes(
    payload: BatchCodesIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep)
):
    require_admin(request, db)
    require_csrf_token(request)

    # 配额限制：可兑换额度 = 空位数 - 未过期未使用兑换码（确保兑换码与位置数量恒定）
    from sqlalchemy import and_, exists
    now = __import__("datetime").datetime.utcnow()

    # 统计空位：仅统计活跃母号、且至少有启用团队的 free 座位
    team_exists = exists().where(
        (models.MotherTeam.mother_id == models.MotherAccount.id) & (models.MotherTeam.is_enabled == True)  # noqa: E712
    )
    free_seats = (
        db.query(models.SeatAllocation)
        .join(models.MotherAccount, models.SeatAllocation.mother_id == models.MotherAccount.id)
        .filter(
            models.MotherAccount.status == models.MotherStatus.active,
            models.SeatAllocation.status == models.SeatStatus.free,
            team_exists,
        )
        .count()
    )

    # 未过期未使用兑换码数量
    active_codes = (
        db.query(models.RedeemCode)
        .filter(
            models.RedeemCode.status == models.CodeStatus.unused,
            ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
        )
        .count()
    )

    remaining = max(0, free_seats - active_codes)
    if payload.count > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"数量超出配额：当前可生成 {remaining} 个（空位 {free_seats}，现有可用码 {active_codes}）",
        )

    batch_id, codes = generate_codes(db, payload.count, payload.prefix, payload.expires_at, payload.batch_id)
    audit_svc.log(db, actor="admin", action="generate_codes", payload_redacted=f"count={payload.count}, batch={batch_id}")
    try:
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.code_generate,
            actor="admin",
            total_count=payload.count,
            success_count=payload.count,
            failed_count=0,
            metadata={
                "batch_id": batch_id,
                "prefix": payload.prefix,
                "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass

    after_active = active_codes + len(codes)
    return BatchCodesOut(
        batch_id=batch_id,
        codes=codes,
        enabled_teams=None,
        max_code_capacity=free_seats,
        active_codes=after_active,
        remaining_quota=max(0, free_seats - after_active),
    )


@router.get("/export/codes")
def export_codes(request: Request, db: Session = Depends(get_db), format: str = "csv", status: str = "all"):
    """导出兑换码列表 - 优化N+1查询
    - format: csv | txt
    - status: all | unused | used
    """
    require_admin(request, db)

    with monitor_session_queries(db, "admin_export_codes"):
        q = db.query(models.RedeemCode).order_by(models.RedeemCode.created_at.desc())
        if status == "unused":
            q = q.filter(models.RedeemCode.status == models.CodeStatus.unused)
        elif status == "used":
            q = q.filter(models.RedeemCode.status == models.CodeStatus.used)

        rows = q.all()

        if format == "txt":
            # txt 仅导出码本身（常见于批量分发场景）
            content = "\n".join([r.code for r in rows])
            headers = {"Content-Disposition": f"attachment; filename=codes-{__import__('datetime').datetime.utcnow().date()}.txt"}
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(content, headers=headers)

        # 优化N+1查询：一次性预加载所有使用信息
        import io, csv

        if rows:
            # 收集所有兑换码ID
            code_ids = [r.id for r in rows]

            # 批量查询使用信息
            users_map = {}
            if code_ids:
                users = db.query(models.InviteRequest).filter(models.InviteRequest.code_id.in_(code_ids)).all()
                # 对于每个兑换码，选择优先状态为sent的用户，否则选择最新的
                for user in users:
                    if user.code_id not in users_map:
                        users_map[user.code_id] = user
                    else:
                        existing = users_map[user.code_id]
                        # 优先选择sent状态的，否则选择更新的
                        if (user.status == models.InviteStatus.sent and existing.status != models.InviteStatus.sent) or \
                           (user.status == existing.status and
                            (user.updated_at or user.created_at) > (existing.updated_at or existing.created_at)):
                            users_map[user.code_id] = user

        # 默认 CSV（不包含 expires_at）
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["code", "batch_id", "is_used", "created_at", "used_by", "used_at"])
        for r in rows:
            user = users_map.get(r.id)
            writer.writerow([
                r.code,
                r.batch_id or "",
                "1" if r.is_used else "0",
                r.created_at.isoformat() if r.created_at else "",
                user.email if user else "",
                user.updated_at.isoformat() if user and r.is_used and user.updated_at else "",
            ])

        from fastapi.responses import Response
        headers = {"Content-Disposition": f"attachment; filename=codes-{__import__('datetime').datetime.utcnow().date()}.csv"}
        return Response(output.getvalue(), media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/export/users")
def export_users(request: Request, db: Session = Depends(get_db), format: str = "csv"):
    """导出用户/邀请列表 - 优化N+1查询
    - format: csv | txt
    """
    require_admin(request, db)

    with monitor_session_queries(db, "admin_export_users"):
        rows = db.query(models.InviteRequest).order_by(models.InviteRequest.created_at.desc()).all()

        if format == "txt":
            # 简单文本：email, team_id, status
            lines: list[str] = []
            for u in rows:
                lines.append(f"{u.email}\t{u.team_id or ''}\t{u.status.value}")
            content = "\n".join(lines)
            headers = {"Content-Disposition": f"attachment; filename=users-{__import__('datetime').datetime.utcnow().date()}.txt"}
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(content, headers=headers)

        # 优化N+1查询：一次性预加载所有关联数据
        import io, csv
        from sqlalchemy.orm import joinedload

        # 收集所有需要的数据ID
        code_ids = [u.code_id for u in rows if u.code_id]
        team_ids = set(u.team_id for u in rows if u.team_id)

        # 批量查询兑换码
        codes_map = {}
        if code_ids:
            codes = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()
            codes_map = {code.id: code for code in codes}

        # 批量查询团队信息
        teams_map = {}
        if team_ids:
            teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
            teams_map = {team.team_id: team for team in teams}

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "email", "status", "team_id", "team_name", "invited_at", "redeemed_at", "code_used"])

        for u in rows:
            code_used = None
            if u.code_id and u.code_id in codes_map:
                code_used = codes_map[u.code_id].code

            team_name = None
            if u.team_id and u.team_id in teams_map:
                team_name = teams_map[u.team_id].team_name

            writer.writerow([
                u.id,
                u.email,
                u.status.value,
                u.team_id or "",
                team_name or "",
                u.created_at.isoformat() if u.created_at else "",
                u.updated_at.isoformat() if (u.status == models.InviteStatus.sent and u.updated_at) else "",
                code_used or "",
            ])

        from fastapi.responses import Response
        headers = {"Content-Disposition": f"attachment; filename=users-{__import__('datetime').datetime.utcnow().date()}.csv"}
        return Response(output.getvalue(), media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/resend")
async def admin_resend_invite(
    payload: ResendIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep)
):
    require_admin(request, db)

    if not payload.team_id:
        raise HTTPException(status_code=400, detail="缺少 team_id")

    ok, msg = resend_invite(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/mothers/batch/validate", response_model=list[MotherBatchValidateItemOut])
def batch_mothers_validate(payload: list[MotherBatchItemIn], request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    out: list[MotherBatchValidateItemOut] = []
    for i, item in enumerate(payload):
        warnings: list[str] = []
        valid = True
        if not item.name or not item.access_token:
            valid = False
            warnings.append("缺少 name 或 access_token")
        # 规范化：保证最多一个默认团队
        default_seen = False
        teams_norm: list[MotherTeamIn] = []
        seen_team_ids: set[str] = set()
        for t in item.teams:
            # 去重 team_id
            if t.team_id in seen_team_ids:
                warnings.append(f"重复的 team_id: {t.team_id}")
                continue
            seen_team_ids.add(t.team_id)
            is_def = bool(t.is_default) and not default_seen
            if t.is_default and default_seen:
                warnings.append("多于一个默认团队，已保留第一个默认")
            if is_def:
                default_seen = True
            teams_norm.append(MotherTeamIn(
                team_id=t.team_id,
                team_name=t.team_name,
                is_enabled=bool(t.is_enabled),
                is_default=is_def,
            ))
        out.append(MotherBatchValidateItemOut(index=i, name=item.name, valid=valid, warnings=warnings, teams=teams_norm))
    return out


@router.post("/mothers/batch/import", response_model=list[MotherBatchImportItemResult])
def batch_mothers_import(payload: list[MotherBatchItemIn], request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    results: list[MotherBatchImportItemResult] = []
    for i, item in enumerate(payload):
        try:
            # 预处理：如有多个默认团队，仅保留第一个
            default_set = False
            teams: list[dict] = []
            seen: set[str] = set()
            for t in item.teams:
                if t.team_id in seen:
                    continue
                seen.add(t.team_id)
                is_def = bool(t.is_default) and not default_set
                if is_def:
                    default_set = True
                teams.append({
                    "team_id": t.team_id,
                    "team_name": t.team_name,
                    "is_enabled": bool(t.is_enabled),
                    "is_default": is_def,
                })

            mother = create_mother(
                db,
                name=item.name,
                access_token=item.access_token,
                token_expires_at=item.token_expires_at,
                teams=teams,
                notes=item.notes,
            )
            results.append(MotherBatchImportItemResult(index=i, success=True, mother_id=mother.id))
        except Exception as e:
            results.append(MotherBatchImportItemResult(index=i, success=False, error=str(e)))
    try:
        success_count = sum(1 for item in results if item.success)
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.mother_import,
            actor="admin",
            total_count=len(results),
            success_count=success_count,
            failed_count=len(results) - success_count,
            metadata={
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass
    return results


@router.get("/batch/supported-actions", response_model=BatchOperationSupportedActions)
def get_supported_batch_actions(request: Request, db: Session = Depends(get_db)):
    """获取支持的批量操作列表"""
    require_admin(request, db)
    return BatchOperationSupportedActions()

@router.post("/batch/codes", response_model=BatchOpOut)
def batch_codes(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """批量操作兑换码
    body: { action: str, ids: List[int], confirm: bool }
    支持: action = disable (禁用未使用的兑换码)
    """
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

    action = payload.action
    ids = payload.ids or []
    confirm = bool(payload.confirm)
    if not confirm:
        raise HTTPException(status_code=400, detail="缺少确认")
    if not action or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="参数错误")

    # 验证操作是否支持
    supported_actions = BatchOperationSupportedActions()
    if action not in supported_actions.codes:
        raise HTTPException(status_code=400, detail=f"不支持的兑换码操作: {action}")

    processed = 0
    failed = 0
    from datetime import datetime
    if action == "disable":
        rows = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(ids)).all()
        for r in rows:
            if r.status != models.CodeStatus.used:
                r.expires_at = datetime.utcnow()
                db.add(r)
                processed += 1
            else:
                failed += 1
        db.commit()
        audit_svc.log(db, actor="admin", action="batch_disable_codes", payload_redacted=f"count={processed}")
        try:
            record_bulk_operation(
                db,
                operation_type=models.BulkOperationType.code_bulk_action,
                actor="admin",
                total_count=len(ids),
                success_count=processed,
                failed_count=failed,
                metadata={
                    "action": action,
                    "request_ip": request.client.host if request.client else None,
                },
            )
        except Exception:
            pass
        return BatchOpOut(
            success=True,
            message=f"已禁用 {processed} 个兑换码",
            processed_count=processed,
            failed_count=failed if failed > 0 else None
        )
    else:
        raise HTTPException(status_code=400, detail="不支持的操作")


@router.post("/batch/users", response_model=BatchOpOut)
def batch_users(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """批量操作用户邀请
    body: { action: str, ids: List[int], confirm: bool }
    支持: resend | cancel | remove
    """
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

    action = payload.action
    ids = payload.ids or []
    confirm = bool(payload.confirm)
    if not confirm:
        raise HTTPException(status_code=400, detail="缺少确认")
    if not action or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="参数错误")

    # 验证操作是否支持
    supported_actions = BatchOperationSupportedActions()
    if action not in supported_actions.users:
        raise HTTPException(status_code=400, detail=f"不支持的用户操作: {action}")

    success = 0
    failed = 0
    # 逐条执行，避免复杂事务
    for uid in ids:
        inv = db.query(models.InviteRequest).filter(models.InviteRequest.id == uid).first()
        if not inv or not inv.email or not inv.team_id:
            failed += 1
            continue
        if action == "resend":
            ok, _ = resend_invite(db, inv.email, inv.team_id)
        elif action == "cancel":
            ok, _ = cancel_invite(db, inv.email, inv.team_id)
        elif action == "remove":
            ok, _ = remove_member(db, inv.email, inv.team_id)
        else:
            raise HTTPException(status_code=400, detail="不支持的操作")
        if ok:
            success += 1
        else:
            failed += 1

    audit_svc.log(db, actor="admin", action=f"batch_users_{action}", payload_redacted=f"success={success}, failed={failed}")
    return BatchOpOut(
        success=True,
        message=f"批量操作完成：成功 {success}，失败 {failed}",
        processed_count=success,
        failed_count=failed if failed > 0 else None
    )


@router.post("/cancel-invite")
def admin_cancel_invite(
    payload: CancelInviteIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

    ok, msg = cancel_invite(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/remove-member")
def admin_remove_member(
    payload: RemoveMemberIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

    ok, msg = remove_member(db, payload.email.strip().lower(), payload.team_id)
    return {"success": ok, "message": msg}


@router.post("/change-password")
def admin_change_password(
    payload: AdminChangePasswordIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

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
    """用户列表接口 - 优化N+1查询"""
    require_admin(request, db)

    with monitor_session_queries(db, "admin_list_users"):
        users = db.query(models.InviteRequest).all()

        if not users:
            return []

        # 批量预加载关联数据，避免N+1查询
        code_ids = [u.code_id for u in users if u.code_id]
        team_ids = set(u.team_id for u in users if u.team_id)

        # 批量查询兑换码
        codes_map = {}
        if code_ids:
            codes = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()
            codes_map = {code.id: code for code in codes}

        # 批量查询团队信息
        teams_map = {}
        if team_ids:
            teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
            teams_map = {team.team_id: team for team in teams}

        result = []

        for user in users:
            code_used = None
            if user.code_id and user.code_id in codes_map:
                code_used = codes_map[user.code_id].code_hash

            team_name = None
            if user.team_id and user.team_id in teams_map:
                team_name = teams_map[user.team_id].team_name

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
    """兑换码列表接口 - 优化N+1查询"""
    require_admin(request, db)

    with monitor_session_queries(db, "admin_list_codes"):
        # 取全部码
        codes = db.query(models.RedeemCode).order_by(models.RedeemCode.created_at.desc()).all()
        if not codes:
            return []

        code_ids = [c.id for c in codes]

        # 一次性取出相关邀请，按 code_id 分组，优先选择 sent 最新，否则选择最新一条
        inv_rows = (
            db.query(models.InviteRequest)
            .filter(models.InviteRequest.code_id.in_(code_ids))
            .all()
        )
        from collections import defaultdict
        inv_by_code: dict[int, models.InviteRequest] = {}
        cand_all: dict[int, models.InviteRequest] = {}
        for inv in inv_rows:
            cid = inv.code_id
            if inv.status == models.InviteStatus.sent:
                prev = inv_by_code.get(cid)
                if (not prev) or (prev.updated_at or inv.updated_at and inv.updated_at and inv.updated_at > (prev.updated_at or inv.updated_at)):
                    inv_by_code[cid] = inv
            prev_any = cand_all.get(cid)
            if (not prev_any) or ((inv.created_at or inv.updated_at) and (prev_any.created_at or prev_any.updated_at) and (inv.created_at or inv.updated_at) > (prev_any.created_at or prev_any.updated_at)):
                cand_all[cid] = inv
        # 确定最终选用
        for cid, any_inv in cand_all.items():
            inv_by_code.setdefault(cid, any_inv)

        # 优化：预取母号与团队（来自 code 的去规范化字段与备选 invite）
        mother_ids: set[int] = set()
        team_ids: set[str] = set()
        for c in codes:
            if c.used_by_mother_id:
                mother_ids.add(c.used_by_mother_id)
            if c.used_by_team_id:
                team_ids.add(c.used_by_team_id)
            inv = inv_by_code.get(c.id)
            if inv:
                if inv.mother_id:
                    mother_ids.add(inv.mother_id)
                if inv.team_id:
                    team_ids.add(inv.team_id)

        # 批量查询母号和团队信息
        mothers_map = {}
        teams_map = {}

        if mother_ids:
            mothers = db.query(models.MotherAccount).filter(models.MotherAccount.id.in_(mother_ids)).all()
            mothers_map = {m.id: m.name for m in mothers}

        if team_ids:
            teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
            teams_map = {t.team_id: (t.team_name or "") for t in teams}

        result = []
        for code in codes:
            inv = inv_by_code.get(code.id)
            map_email = code.used_by_email or (inv.email if inv else None)
            map_mother_id = code.used_by_mother_id or ((inv.mother_id) if inv else None)
            map_team_id = code.used_by_team_id or ((inv.team_id) if inv else None)
            mother_name = mothers_map.get(map_mother_id) if map_mother_id else None
            team_name = teams_map.get(map_team_id) if map_team_id else None

            result.append(
                {
                    "id": code.id,
                    "code": code.code,
                    "batch_id": code.batch_id,
                    "is_used": code.is_used,
                    "expires_at": code.expires_at.isoformat() if code.expires_at else None,
                    "created_at": code.created_at.isoformat() if code.created_at else None,
                    "used_by": map_email,
                    "used_at": (code.used_at.isoformat() if code.used_at else (inv.updated_at.isoformat() if inv and code.is_used and inv.updated_at else None)),
                    "mother_id": map_mother_id,
                    "mother_name": mother_name,
                    "team_id": map_team_id,
                    "team_name": team_name,
                    "invite_status": (inv.status.value if inv else None),
                }
            )

        return result


@router.post("/codes/{code_id}/disable")
def disable_code(
    code_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

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
def update_mother(
    mother_id: int,
    payload: MotherCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

    mother = db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    # 更新基本信息
    mother.name = payload.name
    mother.notes = payload.notes

    # 更新访问令牌（若提供）
    if payload.access_token:
        from app.security import encrypt_token
        from datetime import datetime, timedelta
        mother.access_token_enc = encrypt_token(payload.access_token)
        # 若未提供新的过期时间，则回退默认 +N 天
        mother.token_expires_at = payload.token_expires_at or (
            datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        )

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
def delete_mother(
    mother_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # 速率限制通过依赖注入完成（admin_ops_rate_limit_dep）

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


@router.get("/performance/stats")
def performance_stats(request: Request, db: Session = Depends(get_db)):
    """获取查询性能统计信息"""
    require_admin(request, db)

    stats = query_monitor.get_stats()
    slow_queries = query_monitor.get_slow_queries()

    return {
        "total_operations": len(stats),
        "operations": stats,
        "slow_queries": slow_queries,
        "enabled": query_monitor.enabled
    }


@router.post("/performance/reset")
def reset_performance_stats(request: Request, db: Session = Depends(get_db)):
    """重置性能统计信息"""
    require_admin(request, db)

    query_monitor.reset_stats()
    audit_svc.log(db, actor="admin", action="reset_performance_stats")
    return {"ok": True, "message": "性能统计已重置"}


@router.post("/performance/toggle")
def toggle_performance_monitoring(request: Request, db: Session = Depends(get_db)):
    """开启/关闭性能监控"""
    require_admin(request, db)

    if query_monitor.enabled:
        query_monitor.disable()
        status = "已关闭"
    else:
        query_monitor.enable()
        status = "已开启"

    audit_svc.log(db, actor="admin", action="toggle_performance_monitoring", payload_redacted=f"status={status}")
    return {"ok": True, "message": f"性能监控{status}", "enabled": query_monitor.enabled}


@router.get("/quota")
def quota_snapshot(request: Request, db: Session = Depends(get_db)):
    """返回当前兑换码与席位配额摘要"""
    require_admin(request, db)
    from sqlalchemy import and_, exists
    from datetime import datetime

    now = datetime.utcnow()

    total_codes = db.query(models.RedeemCode).count()
    used_codes = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()
    active_codes = (
        db.query(models.RedeemCode)
        .filter(
            models.RedeemCode.status == models.CodeStatus.unused,
            ((models.RedeemCode.expires_at == None) | (models.RedeemCode.expires_at > now)),  # noqa: E711
        )
        .count()
    )

    team_exists = exists().where(
        (models.MotherTeam.mother_id == models.MotherAccount.id) & (models.MotherTeam.is_enabled == True)  # noqa: E712
    )
    free_seats = (
        db.query(models.SeatAllocation)
        .join(models.MotherAccount, models.SeatAllocation.mother_id == models.MotherAccount.id)
        .filter(
            models.MotherAccount.status == models.MotherStatus.active,
            models.SeatAllocation.status == models.SeatStatus.free,
            team_exists,
        )
        .count()
    )
    used_seats = (
        db.query(models.SeatAllocation)
        .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
        .count()
    )

    pending_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()

    remaining_quota = max(0, free_seats - active_codes)

    return {
        "total_codes": total_codes,
        "used_codes": used_codes,
        "active_codes": active_codes,
        "max_code_capacity": free_seats,
        "remaining_quota": remaining_quota,
        "used_seats": used_seats,
        "pending_invites": pending_invites,
        "generated_at": now.isoformat(),
    }


@router.get("/bulk/history")
def bulk_history(request: Request, db: Session = Depends(get_db), limit: int = 50, offset: int = 0):
    """列出最近的批量操作记录"""
    require_admin(request, db)
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)

    logs = (
        db.query(models.BulkOperationLog)
        .order_by(models.BulkOperationLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "operation_type": log.operation_type.value if isinstance(log.operation_type, models.BulkOperationType) else str(log.operation_type),
            "actor": log.actor,
            "total_count": log.total_count,
            "success_count": log.success_count,
            "failed_count": log.failed_count,
            "metadata": json.loads(log.metadata_json or "{}"),
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
