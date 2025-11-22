"""
管理员用户列表相关路由
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.utils.performance import monitor_session_queries
from app.utils.pagination import compute_pagination

from .dependencies import get_db, get_db_pool, require_admin, require_domain

router = APIRouter()


@router.get("/users")
async def list_users(
    request: Request,
    db: Session = Depends(get_db),
    db_pool: Session = Depends(get_db_pool),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量，默认50，最大200"),
    status: Optional[str] = Query(None, description="用户状态过滤"),
    search: Optional[str] = Query(None, description="按邮箱/团队搜索"),
):
    """用户列表接口 - 支持分页并优化 N+1 查询"""
    require_admin(request, db)
    await require_domain('users')(request)

    with monitor_session_queries(db, "admin_list_users"):
        query = db.query(models.InviteRequest)

        status_value = (status or "").strip().lower()
        if status_value:
            try:
                status_enum = models.InviteStatus(status_value)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="无效的用户状态") from exc
            query = query.filter(models.InviteRequest.status == status_enum)

        search_value = (search or "").strip()
        if search_value:
            like = f"%{search_value.lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.InviteRequest.email).like(like),
                    func.lower(models.InviteRequest.team_id).like(like),
                    func.lower(models.InviteRequest.error_msg).like(like),
                )
            )

        total = query.count()
        meta, offset = compute_pagination(total, page, page_size)
        if total == 0:
            return {"items": [], "pagination": meta.as_dict()}
        users = (
            query.order_by(models.InviteRequest.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        if not users:
            return {"items": [], "pagination": meta.as_dict()}

        code_ids = [u.code_id for u in users if u.code_id]
        team_ids = {u.team_id for u in users if u.team_id}

        codes_map = {}
        if code_ids:
            codes = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()
            codes_map = {code.id: code for code in codes}

        teams_map = {}
        if team_ids:
            # 注意：MotherTeam 属于 Pool 库，必须使用 Pool 会话查询
            teams = db_pool.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()
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
                    "redeemed_at": (
                        user.updated_at.isoformat()
                        if user.status == models.InviteStatus.sent and user.updated_at
                        else None
                    ),
                    "code_used": code_used,
                }
            )

        return {"items": result, "pagination": meta.as_dict()}


__all__ = ["router"]
