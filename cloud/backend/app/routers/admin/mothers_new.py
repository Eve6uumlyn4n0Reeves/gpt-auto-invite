"""
Mother账号管理路由（使用新的服务层）。

这个文件展示了如何使用新的服务层架构来重构路由。
相比原来的mothers.py，这个版本：
1. 使用DTO替代直接ORM操作
2. 通过Repository和Service层进行业务逻辑处理
3. 更清晰的错误处理和响应格式
4. 支持更复杂的查询过滤
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.domains.mother import (
    MotherSummary,
    MotherCreatePayload,
    MotherUpdatePayload,
    MotherListFilters,
    MotherListResult,
    MotherStatusDto,
)
from app.services.services import (
    MotherCommandServiceDep,
    MotherQueryServiceDep,
    MotherServicesDep,
)
from app.services.services import audit as audit_svc
from app.routers.admin.dependencies import (
    get_db_pool,
    get_db,
    require_admin,
    admin_ops_rate_limit_dep,
    require_domain,
)
from app.utils.csrf import require_csrf_token
from app.schemas import (
    MotherCreateIn,
    MotherUpdateIn,
    MotherOut,
)

router = APIRouter()


def mother_summary_to_schema(summary: MotherSummary) -> MotherOut:
    """将MotherSummary DTO转换为响应Schema"""
    return MotherOut(
        id=summary.id,
        name=summary.name,
        status=summary.status.value,
        seat_limit=summary.seat_limit,
        group_id=summary.group_id,
        pool_group_id=summary.pool_group_id,
        notes=summary.notes,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        teams_count=summary.teams_count,
        children_count=summary.children_count,
        seats_in_use=summary.seats_in_use,
        seats_available=summary.seats_available,
        # 详细信息（可根据需要选择性返回）
        teams=[{
            "team_id": t.team_id,
            "team_name": t.team_name,
            "is_enabled": t.is_enabled,
            "is_default": t.is_default,
        } for t in summary.teams],
        children=[{
            "child_id": c.child_id,
            "name": c.name,
            "email": c.email,
            "team_id": c.team_id,
            "team_name": c.team_name,
            "status": c.status,
            "member_id": c.member_id,
            "created_at": c.created_at,
        } for c in summary.children],
        seats=[{
            "slot_index": s.slot_index,
            "team_id": s.team_id,
            "email": s.email,
            "status": s.status,
            "held_until": s.held_until,
            "invite_request_id": s.invite_request_id,
            "invite_id": s.invite_id,
            "member_id": s.member_id,
        } for s in summary.seats],
    )


@router.post("/mothers", response_model=MotherOut)
async def create_mother(
    payload: MotherCreateIn,
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    创建新的Mother账号

    需要管理员权限和Pool域验证
    """
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        # 转换输入为DTO
        create_payload = MotherCreatePayload(
            name=payload.name,
            access_token_enc=payload.access_token_enc,
            seat_limit=payload.seat_limit or 7,
            group_id=payload.group_id,
            pool_group_id=payload.pool_group_id,
            notes=payload.notes,
        )

        # 使用命令服务创建
        summary = mother_services.command.create_mother(create_payload)

        # 记录审计日志
        try:
            audit_svc.log(
                db_users,
                actor="admin",
                action="create_mother",
                target_type="mother",
                target_id=str(summary.id),
                details=f"Created mother: {summary.name}",
            )
        except Exception:
            pass  # 审计失败不影响主流程

        return mother_summary_to_schema(summary)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建Mother账号失败: {str(e)}")


@router.get("/mothers/{mother_id}", response_model=MotherOut)
def get_mother(
    mother_id: int,
    request: Request,
    mother_query: MotherQueryServiceDep,
    db_users: Session = Depends(get_db),
):
    """
    获取单个Mother账号的详细信息

    需要管理员权限
    """
    require_admin(request, db_users)

    summary = mother_query.get_mother(mother_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Mother账号不存在")

    return mother_summary_to_schema(summary)


@router.get("/mothers", response_model=MotherListResult)
def list_mothers(
    request: Request,
    mother_query: MotherQueryServiceDep,
    db_users: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    status: Optional[str] = Query(None, description="状态过滤"),
    group_id: Optional[int] = Query(None, description="组ID过滤"),
    pool_group_id: Optional[int] = Query(None, description="号池组ID过滤"),
    has_pool_group: Optional[bool] = Query(None, description="是否已分配到号池组"),
):
    """
    分页查询Mother账号列表

    支持多种过滤条件，需要管理员权限
    """
    require_admin(request, db_users)

    # 构建过滤器
    filters = MotherListFilters(
        search=search,
        status=MotherStatusDto(status) if status else None,
        group_id=group_id,
        pool_group_id=pool_group_id,
        has_pool_group=has_pool_group,
    )

    # 使用查询服务获取结果
    result = mother_query.list_mothers(filters, page, page_size)

    # 转换为响应格式
    return MotherListResult(
        items=[mother_summary_to_schema(item) for item in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        has_next=result.has_next,
        has_prev=result.has_prev,
    )


@router.put("/mothers/{mother_id}", response_model=MotherOut)
async def update_mother(
    mother_id: int,
    payload: MotherUpdateIn,
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    更新Mother账号信息

    需要管理员权限和Pool域验证
    """
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        # 转换输入为DTO
        update_payload = MotherUpdatePayload(
            name=payload.name,
            status=MotherStatusDto(payload.status) if payload.status else None,
            seat_limit=payload.seat_limit,
            group_id=payload.group_id,
            pool_group_id=payload.pool_group_id,
            notes=payload.notes,
        )

        # 使用命令服务更新
        summary = mother_services.command.update_mother(mother_id, update_payload)

        # 记录审计日志
        try:
            audit_svc.log(
                db_users,
                actor="admin",
                action="update_mother",
                target_type="mother",
                target_id=str(mother_id),
                details=f"Updated mother: {summary.name}",
            )
        except Exception:
            pass

        return mother_summary_to_schema(summary)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新Mother账号失败: {str(e)}")


@router.delete("/mothers/{mother_id}")
async def delete_mother(
    mother_id: int,
    request: Request,
    mother_command: MotherCommandServiceDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    删除Mother账号

    需要管理员权限和Pool域验证
    只能删除没有已使用席位和子号的Mother账号
    """
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        success = mother_command.delete_mother(mother_id)
        if success:
            # 记录审计日志
            try:
                audit_svc.log(
                    db_users,
                    actor="admin",
                    action="delete_mother",
                    target_type="mother",
                    target_id=str(mother_id),
                    details=f"Deleted mother with ID: {mother_id}",
                )
            except Exception:
                pass
            return {"success": True, "message": "Mother账号删除成功"}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除Mother账号失败: {str(e)}")


# 状态管理端点
@router.post("/mothers/{mother_id}/enable", response_model=MotherOut)
async def enable_mother(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """启用Mother账号"""
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        summary = mother_services.command.enable_mother(mother_id)
        return mother_summary_to_schema(summary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mothers/{mother_id}/disable", response_model=MotherOut)
async def disable_mother(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """禁用Mother账号"""
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        summary = mother_services.command.disable_mother(mother_id)
        return mother_summary_to_schema(summary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mothers/{mother_id}/mark-invalid", response_model=MotherOut)
async def mark_mother_invalid(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """标记Mother账号为无效（token过期等）"""
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        summary = mother_services.command.mark_mother_invalid(mother_id)
        return mother_summary_to_schema(summary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# 号池组分配管理
@router.post("/mothers/{mother_id}/assign-pool-group", response_model=MotherOut)
async def assign_to_pool_group(
    mother_id: int,
    pool_group_id: Optional[int],
    request: Request,
    mother_services: MotherServicesDep,
    db_users: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """将Mother账号分配到号池组（设为None则移除分配）"""
    require_admin(request, db_users)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        summary = mother_services.command.assign_to_pool_group(mother_id, pool_group_id)
        return mother_summary_to_schema(summary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# 统计信息端点
@router.get("/mothers/stats/summary")
def get_mothers_stats_summary(
    request: Request,
    mother_query: MotherQueryServiceDep,
    db_users: Session = Depends(get_db),
):
    """获取Mother账号统计摘要"""
    require_admin(request, db_users)
    return mother_query.get_quota_metrics()


@router.get("/mothers/stats/status-distribution")
def get_mothers_status_distribution(
    request: Request,
    mother_query: MotherQueryServiceDep,
    db_users: Session = Depends(get_db),
):
    """获取Mother账号状态分布"""
    require_admin(request, db_users)
    return mother_query.get_mother_status_distribution()