"""
Admin children management routes.

Implements:
- GET    /api/admin/mothers/{mother_id}/children
- POST   /api/admin/mothers/{mother_id}/children/auto-pull
- POST   /api/admin/mothers/{mother_id}/children/sync
- DELETE /api/admin/children/{child_id}

These endpoints rely on Pool DB and require admin session; for POST/DELETE, also require X-Domain: pool and CSRF token.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.routers.admin.dependencies import (
    get_db as get_users_db,
    get_db_pool,
    require_admin,
    admin_ops_rate_limit_dep,
    require_domain,
)
from app.utils.csrf import require_csrf_token
from app.repositories.mother_repository import MotherRepository
from app.services.services.child_account import ChildAccountService
from app import models

router = APIRouter()


@router.get("/mothers/{mother_id}/children")
def list_children(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
):
    require_admin(request, users_db)

    svc = ChildAccountService(MotherRepository(pool_db))
    items = svc.get_children_by_mother(mother_id)
    # Shape to DTO-like dicts expected by FE/tests
    return {
        "items": [
            {
                "id": c.id,
                "child_id": c.child_id,
                "name": c.name,
                "email": c.email,
                "team_id": c.team_id,
                "team_name": c.team_name,
                "status": c.status,
                "member_id": c.member_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in items
        ]
    }


@router.post("/mothers/{mother_id}/children/auto-pull")
async def auto_pull_children(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    await require_domain("pool")(request)
    await require_csrf_token(request)

    # Validate mother and token presence upfront to align with tests
    mother = pool_db.get(models.MotherAccount, mother_id)
    if not mother:
        raise HTTPException(status_code=404, detail="Mother not found")
    if not mother.access_token_enc:
        raise HTTPException(status_code=400, detail="母号缺少 access_token 或未设置")

    svc = ChildAccountService(MotherRepository(pool_db))
    created = svc.auto_pull_children_for_mother(mother_id)
    return {"ok": True, "created_count": len(created)}


@router.post("/mothers/{mother_id}/children/sync")
async def sync_children(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    await require_domain("pool")(request)
    await require_csrf_token(request)

    svc = ChildAccountService(MotherRepository(pool_db))
    result = svc.sync_child_members(mother_id)
    return {
        "ok": bool(result.get("success")),
        "synced_count": int(result.get("synced_count", 0)),
        "error_count": int(result.get("error_count", 0)),
        "message": result.get("message", "")
    }


@router.delete("/children/{child_id}")
async def delete_child(
    child_id: int,
    request: Request,
    users_db: Session = Depends(get_users_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    await require_domain("pool")(request)
    await require_csrf_token(request)

    svc = ChildAccountService(MotherRepository(pool_db))
    ok = svc.remove_child_member(child_id)
    if not ok:
        # Keep 200 with ok=False could be acceptable, but tests expect ok True only on success.
        # Use 404 to indicate not found.
        raise HTTPException(status_code=404, detail="Child not found or remove failed")
    return {"ok": True}

