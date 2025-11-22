"""
用户组管理相关路由

NOTE: MotherGroup 目前仍存放在 Pool 库中，代表售卖侧的运营分组。
      中期计划将其迁移至 Users 库，当前文档需注明该跨域语义。
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import models
from app.schemas import MotherGroupCreateIn, MotherGroupOut, MotherGroupUpdateIn
from app.services.services import audit as audit_svc
from app.services.services import mother_group_service as svc
from app.utils.csrf import require_csrf_token

from .dependencies import admin_ops_rate_limit_dep, get_db_pool, require_admin, require_domain

router = APIRouter()


@router.post("/mother-groups", response_model=MotherGroupOut)
async def create_mother_group(
    payload: MotherGroupCreateIn,
    request: Request,
    db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """创建用户组"""
    require_admin(request, db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    # 检查名称是否已存在
    existing = db.query(models.MotherGroup).filter(models.MotherGroup.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户组名称已存在")

    try:
        group = svc.create(
            db,
            name=payload.name,
            description=payload.description,
            team_name_template=payload.team_name_template,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        audit_svc.log(
            db, actor="admin", action="create_mother_group", target_type="mother_group", target_id=str(group.id)
        )
    except Exception:
        pass

    return MotherGroupOut.model_validate(group)


@router.get("/mother-groups", response_model=List[MotherGroupOut])
def list_mother_groups(
    request: Request,
    db: Session = Depends(get_db_pool),
    active_only: bool = Query(False, description="仅显示活跃组"),
):
    """列出所有用户组"""
    require_admin(request, db)

    groups = svc.list_groups(db, active_only=active_only)
    return [MotherGroupOut.model_validate(g) for g in groups]


@router.get("/mother-groups/{group_id}", response_model=MotherGroupOut)
def get_mother_group(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db_pool),
):
    """获取单个用户组"""
    require_admin(request, db)

    group = svc.get(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")
    return MotherGroupOut.model_validate(group)


@router.put("/mother-groups/{group_id}", response_model=MotherGroupOut)
async def update_mother_group(
    group_id: int,
    payload: MotherGroupUpdateIn,
    request: Request,
    db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """更新用户组"""
    require_admin(request, db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        group = svc.update(
            db,
            group_id,
            name=payload.name,
            description=payload.description,
            team_name_template=payload.team_name_template,
            is_active=payload.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        audit_svc.log(
            db, actor="admin", action="update_mother_group", target_type="mother_group", target_id=str(group_id)
        )
    except Exception:
        pass

    return MotherGroupOut.model_validate(group)


@router.delete("/mother-groups/{group_id}")
async def delete_mother_group(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """删除用户组（仅当组内无母号时）"""
    require_admin(request, db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        svc.delete(db, group_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        audit_svc.log(
            db, actor="admin", action="delete_mother_group", target_type="mother_group", target_id=str(group_id)
        )
    except Exception:
        pass

    return {"ok": True, "message": "用户组删除成功"}


__all__ = ["router"]
