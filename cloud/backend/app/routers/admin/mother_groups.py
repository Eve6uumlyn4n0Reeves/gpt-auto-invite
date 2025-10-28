"""
用户组管理相关路由
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import models
from app.schemas import MotherGroupCreateIn, MotherGroupOut, MotherGroupUpdateIn
from app.services.services import audit as audit_svc
from app.utils.csrf import require_csrf_token

from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin

router = APIRouter()


@router.post("/mother-groups", response_model=MotherGroupOut)
async def create_mother_group(
    payload: MotherGroupCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """创建用户组"""
    require_admin(request, db)
    await require_csrf_token(request)

    # 检查名称是否已存在
    existing = db.query(models.MotherGroup).filter(models.MotherGroup.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户组名称已存在")

    group = models.MotherGroup(
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        team_name_template=payload.team_name_template,
        is_active=True,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    try:
        audit_svc.log(
            db, actor="admin", action="create_mother_group", target_type="mother_group", target_id=str(group.id)
        )
    except Exception:
        pass

    return group


@router.get("/mother-groups", response_model=List[MotherGroupOut])
def list_mother_groups(
    request: Request,
    db: Session = Depends(get_db),
    active_only: bool = Query(False, description="仅显示活跃组"),
):
    """列出所有用户组"""
    require_admin(request, db)

    query = db.query(models.MotherGroup)
    if active_only:
        query = query.filter(models.MotherGroup.is_active == True)

    groups = query.order_by(models.MotherGroup.created_at.desc()).all()
    return groups


@router.get("/mother-groups/{group_id}", response_model=MotherGroupOut)
def get_mother_group(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """获取单个用户组"""
    require_admin(request, db)

    group = db.get(models.MotherGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")

    return group


@router.put("/mother-groups/{group_id}", response_model=MotherGroupOut)
async def update_mother_group(
    group_id: int,
    payload: MotherGroupUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """更新用户组"""
    require_admin(request, db)
    await require_csrf_token(request)

    group = db.get(models.MotherGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")

    # 检查名称冲突（除了自己）
    if payload.name:
        existing = (
            db.query(models.MotherGroup)
            .filter(models.MotherGroup.name == payload.name.strip(), models.MotherGroup.id != group_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="用户组名称已存在")
        group.name = payload.name.strip()

    if payload.description is not None:
        group.description = payload.description.strip() or None

    if payload.team_name_template is not None:
        group.team_name_template = payload.team_name_template

    if payload.is_active is not None:
        group.is_active = payload.is_active

    db.add(group)
    db.commit()
    db.refresh(group)

    try:
        audit_svc.log(
            db, actor="admin", action="update_mother_group", target_type="mother_group", target_id=str(group_id)
        )
    except Exception:
        pass

    return group


@router.delete("/mother-groups/{group_id}")
async def delete_mother_group(
    group_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """删除用户组（仅当组内无母号时）"""
    require_admin(request, db)
    await require_csrf_token(request)

    group = db.get(models.MotherGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")

    # 检查是否有母号关联
    mother_count = db.query(models.MotherAccount).filter(models.MotherAccount.group_id == group_id).count()
    if mother_count > 0:
        raise HTTPException(status_code=400, detail=f"无法删除：该组内仍有 {mother_count} 个母号")

    db.delete(group)
    db.commit()

    try:
        audit_svc.log(
            db, actor="admin", action="delete_mother_group", target_type="mother_group", target_id=str(group_id)
        )
    except Exception:
        pass

    return {"ok": True, "message": "用户组删除成功"}


__all__ = ["router"]


