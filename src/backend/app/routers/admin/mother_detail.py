"""
母号详情只读接口（最小依赖版）。

提供 GET /api/admin/mothers/{mother_id} 返回 MotherSummary（含 seats 摘要），
避免引入额外的 Pydantic 模型以降低路由装配风险。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from sqlalchemy.orm import Session

from app.routers.admin.dependencies import get_db as get_users_db, get_db_pool, require_admin
from app.repositories.mother_repository import MotherRepository
from app.services.services.mother_query import MotherQueryService
from app.utils.csrf import require_csrf_token


router = APIRouter()


@router.post("/mothers")
def create_mother(
    payload: dict = Body(...),
    request: Request = None,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(require_csrf_token),
):
    """
    创建母号（测试/管理用途）。

    需要管理员登录与CSRF校验。仅做最小字段校验以匹配测试预期：
    - name: str
    - access_token: str（将加密存储到 access_token_enc）
    - token_expires_at: datetime | None
    - notes: str | None
    - seat_limit: int | None（默认7）
    - teams: list[{team_id, team_name, is_enabled, is_default}] | None
    """
    require_admin(request, users_db)

    from app import models
    from app.security import encrypt_token
    from app.repositories.mother_repository import MotherRepository

    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    access_token = payload.get("access_token")
    enc = encrypt_token(access_token) if access_token else None

    mother = models.MotherAccount(
        name=name,
        access_token_enc=enc,
        token_expires_at=payload.get("token_expires_at"),
        notes=payload.get("notes"),
        seat_limit=int(payload.get("seat_limit") or 7),
        status=models.MotherStatus.active,
    )
    pool_db.add(mother)
    pool_db.flush()

    teams = payload.get("teams")
    if isinstance(teams, list) and teams:
        repo = MotherRepository(pool_db)
        repo.replace_teams(mother.id, teams)

    pool_db.commit()
    return {"ok": True, "id": mother.id}


@router.get("/mothers/{mother_id}")
def get_mother_detail(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
):
    require_admin(request, users_db)

    mq = MotherQueryService(pool_db, MotherRepository(pool_db))
    summary = mq.get_mother(mother_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Mother not found")

    data = {
        "id": summary.id,
        "name": summary.name,
        "status": summary.status.value,
        "seat_limit": summary.seat_limit,
        "group_id": summary.group_id,
        "pool_group_id": summary.pool_group_id,
        "notes": summary.notes,
        "created_at": summary.created_at.isoformat(),
        "updated_at": summary.updated_at.isoformat(),
        "teams_count": summary.teams_count,
        "children_count": summary.children_count,
        "seats_in_use": summary.seats_in_use,
        "seats_available": summary.seats_available,
        "teams": [
            {
                "team_id": t.team_id,
                "team_name": t.team_name,
                "is_enabled": t.is_enabled,
                "is_default": t.is_default,
            }
            for t in summary.teams
        ],
        "children": [
            {
                "child_id": c.child_id,
                "name": c.name,
                "email": c.email,
                "team_id": c.team_id,
                "team_name": c.team_name,
                "status": c.status,
                "member_id": c.member_id,
                "created_at": c.created_at.isoformat(),
            }
            for c in summary.children
        ],
        "seats": [
            {
                "slot_index": s.slot_index,
                "team_id": s.team_id,
                "email": s.email,
                "status": s.status,
                "held_until": s.held_until.isoformat() if s.held_until else None,
                "invite_request_id": s.invite_request_id,
                "invite_id": s.invite_id,
                "member_id": s.member_id,
            }
            for s in summary.seats
        ],
    }

    return {"success": True, "data": data}




@router.put("/mothers/{mother_id}")
def update_mother(
    mother_id: int,
    payload: dict = Body(...),
    request: Request = None,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
):
    """更新母号信息，并可一次性替换团队列表（用于测试用例）。

    接收字段（任意可选）：
    - name: str
    - access_token: str（原文token，将在后端加密存储）
    - token_expires_at: datetime | None
    - notes: str | None
    - seat_limit: int | None
    - teams: list[{team_id, team_name, is_enabled, is_default}] | None
    """
    require_admin(request, users_db)

    from app import models
    from app.repositories.mother_repository import MotherRepository
    from app.security import encrypt_token

    mother = pool_db.get(models.MotherAccount, mother_id)
    if not mother:
        raise HTTPException(status_code=404, detail="Mother not found")

    # 基本字段更新
    name = payload.get("name")
    if name:
        mother.name = str(name).strip()

    if "token_expires_at" in payload:
        mother.token_expires_at = payload.get("token_expires_at")

    if "notes" in payload:
        mother.notes = payload.get("notes")

    if payload.get("access_token") is not None:
        mother.access_token_enc = encrypt_token(payload.get("access_token"))

    if isinstance(payload.get("seat_limit"), int):
        mother.seat_limit = int(payload.get("seat_limit"))

    pool_db.add(mother)

    # 团队替换（如果提供）
    teams = payload.get("teams")
    if isinstance(teams, list):
        repo = MotherRepository(pool_db)
        repo.replace_teams(mother.id, teams)

    pool_db.commit()

    return {"success": True, "id": mother.id}

__all__ = ["router"]

