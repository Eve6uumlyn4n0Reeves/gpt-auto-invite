from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.schemas import PoolGroupCreateIn, PoolGroupOut, PoolGroupSettingsIn, NamePreviewOut
from app import models
from app.services.services import audit as audit_svc
from app.services.services.pool_group import (
    create_pool_group as create_pool_group_service,
    list_pool_groups as list_pool_groups_service,
    update_pool_group_settings as update_pool_group_settings_service,
    preview_pool_group_names as preview_pool_group_names_service,
    enqueue_pool_group_sync as enqueue_pool_group_sync_service,
)
from .dependencies import get_db_pool, get_db, require_admin, admin_ops_rate_limit_dep, require_domain
from app.utils.csrf import require_csrf_token


router = APIRouter()


@router.post("/pool-groups", response_model=PoolGroupOut)
async def create_pool_group(
    payload: PoolGroupCreateIn,
    request: Request,
    db: Session = Depends(get_db_pool),
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)
    try:
        row = create_pool_group_service(
            db,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        audit_svc.log(db_users, actor="admin", action="create_pool_group", target_type="pool_group", target_id=str(row.id))
    except Exception:
        pass
    return row


@router.get("/pool-groups", response_model=list[PoolGroupOut])
def list_pool_groups(request: Request, db: Session = Depends(get_db_pool), db_users: Session = Depends(get_db)):
    require_admin(request, db_users)
    # 读接口：生产建议传 X-Domain=pool（不强制），以便审计
    return list_pool_groups_service(db)


@router.post("/pool-groups/{group_id}/settings")
async def update_pool_group_settings(
    group_id: int,
    payload: PoolGroupSettingsIn,
    request: Request,
    db: Session = Depends(get_db_pool),
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)
    try:
        update_pool_group_settings_service(
            db,
            group_id,
            team_template=payload.team_template,
            child_name_template=payload.child_name_template,
            child_email_template=payload.child_email_template,
            email_domain=payload.email_domain,
            is_active=payload.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        audit_svc.log(db_users, actor="admin", action="update_pool_group_settings", target_type="pool_group", target_id=str(group_id))
    except Exception:
        pass
    return {"success": True}


@router.get("/pool-groups/{group_id}/preview", response_model=NamePreviewOut)
def preview_names(group_id: int, request: Request, db: Session = Depends(get_db_pool), db_users: Session = Depends(get_db)):
    require_admin(request, db_users)
    try:
        examples = preview_pool_group_names_service(db, group_id, samples=3)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return NamePreviewOut(examples=examples)


@router.post("/pool-groups/{group_id}/sync/mother/{mother_id}")
async def enqueue_pool_sync(
    group_id: int,
    mother_id: int,
    request: Request,
    db: Session = Depends(get_db_pool),
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)
    try:
        job = enqueue_pool_group_sync_service(db, db_users, mother_id=mother_id, group_id=group_id)
        return {"success": True, "job_id": job.id}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/pool-groups/{group_id}/sync/all")
async def enqueue_pool_sync_all(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db_pool),
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """将该号池组下所有母号入队 `pool_sync_mother`（带入队去重）。"""
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)
    try:
        mothers = (
            db.query(models.MotherAccount)
            .filter(models.MotherAccount.pool_group_id == group_id)
            .all()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    job_ids: list[int] = []
    for m in mothers:
        try:
            job = enqueue_pool_group_sync_service(db, db_users, mother_id=m.id, group_id=group_id)
            job_ids.append(job.id)
        except Exception:
            # 单个母号失败不影响整体
            continue

    return {"success": True, "count": len(job_ids), "job_ids": job_ids}
