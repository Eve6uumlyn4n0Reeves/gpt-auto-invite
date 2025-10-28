"""
Mother账号管理路由（完全重构版 - 展示新架构和错误处理）

这个文件展示了如何使用：
1. 新的服务层架构
2. 统一的错误处理机制
3. 标准化的响应格式
4. 完整的依赖注入
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.schemas import MotherCreateIn, MotherUpdateIn
from app.services.services import MotherServicesDep
from app.services.services import audit as audit_svc
from app.utils.error_handler import (
    ApiResponse,
    MotherNotFoundError,
    MotherAlreadyExistsError,
    BusinessError,
    handle_errors,
)
from app.utils.csrf import require_csrf_token
from app.routers.admin.dependencies import (
    admin_ops_rate_limit_dep,
    get_db,
    require_admin,
    require_domain,
)

router = APIRouter()


@router.post("/mothers")
@handle_errors
async def create_mother_account(
    payload: MotherCreateIn,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    创建新的Mother账号（使用新错误处理）

    - 使用统一的错误处理装饰器
    - 标准化的响应格式
    - 详细的业务逻辑验证
    """
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    # 业务逻辑验证
    if not payload.name or len(payload.name.strip()) == 0:
        raise BusinessError("Mother账号名称不能为空", error_code="VALIDATION_ERROR")

    try:
        # 转换为服务层DTO
        from app.domains.mother import MotherCreatePayload
        from app.security import encrypt_token

        access_token_enc = payload.access_token_enc
        if not access_token_enc and hasattr(payload, 'access_token') and payload.access_token:
            access_token_enc = encrypt_token(payload.access_token)

        create_payload = MotherCreatePayload(
            name=payload.name.strip(),
            access_token_enc=access_token_enc,
            seat_limit=7,
            group_id=payload.group_id,
            pool_group_id=getattr(payload, 'pool_group_id', None),
            notes=payload.notes,
        )

        # 使用服务层创建
        mother_summary = mother_services.command.create_mother(create_payload)

        # 记录审计日志
        audit_svc.log(
            users_db,
            actor="admin",
            action="create_mother",
            target_type="mother",
            target_id=str(mother_summary.id),
            details=f"Created mother: {mother_summary.name}",
        )

        # 返回标准格式响应
        return ApiResponse.success(
            data={
                "id": mother_summary.id,
                "name": mother_summary.name,
                "status": mother_summary.status.value,
                "seat_limit": mother_summary.seat_limit,
                "seats_available": mother_summary.seats_available,
                "created_at": mother_summary.created_at.isoformat(),
            },
            message="Mother账号创建成功"
        )

    except ValueError as e:
        # 转换为业务异常
        if "已存在" in str(e):
            raise MotherAlreadyExistsError(payload.name)
        elif "不存在" in str(e):
            if "PoolGroup" in str(e):
                from app.utils.error_handler import PoolGroupNotFoundError
                pool_group_id = getattr(payload, 'pool_group_id', None)
                raise PoolGroupNotFoundError(pool_group_id)
        raise BusinessError(f"创建Mother账号失败: {str(e)}")


@router.get("/mothers")
@handle_errors
def list_mothers(
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    status: Optional[str] = Query(None, description="状态过滤"),
    pool_group_id: Optional[int] = Query(None, description="号池组过滤"),
):
    """
    列表查询Mother账号（使用新响应格式）

    - 统一的分页响应格式
    - 丰富的过滤条件
    - 性能优化的查询
    """
    require_admin(request, users_db)

    # 构建过滤器
    from app.domains.mother import MotherListFilters, MotherStatusDto

    filters = MotherListFilters(
        search=search,
        status=MotherStatusDto(status) if status else None,
        pool_group_id=pool_group_id,
    )

    # 使用查询服务
    result = mother_services.query.list_mothers(filters, page, page_size)

    # 转换为响应数据
    items = []
    for mother in result.items:
        item = {
            "id": mother.id,
            "name": mother.name,
            "status": mother.status.value,
            "seat_limit": mother.seat_limit,
            "seats_in_use": mother.seats_in_use,
            "seats_available": mother.seats_available,
            "pool_group_id": mother.pool_group_id,
            "notes": mother.notes,
            "created_at": mother.created_at.isoformat(),
            "updated_at": mother.updated_at.isoformat(),
            "teams_count": mother.teams_count,
            "children_count": mother.children_count,
        }
        items.append(item)

    # 返回分页响应
    return ApiResponse.paginated(
        items=items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        message="查询成功"
    )


@router.get("/mothers/{mother_id}")
@handle_errors
def get_mother_detail(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
):
    """
    获取单个Mother账号详情（新错误处理示例）

    - 使用特定的异常类型
    - 详细的错误信息
    - 标准化的响应格式
    """
    require_admin(request, users_db)

    mother_summary = mother_services.query.get_mother(mother_id)
    if not mother_summary:
        raise MotherNotFoundError(mother_id)

    return ApiResponse.success(
        data={
            "id": mother_summary.id,
            "name": mother_summary.name,
            "status": mother_summary.status.value,
            "seat_limit": mother_summary.seat_limit,
            "group_id": mother_summary.group_id,
            "pool_group_id": mother_summary.pool_group_id,
            "notes": mother_summary.notes,
            "created_at": mother_summary.created_at.isoformat(),
            "updated_at": mother_summary.updated_at.isoformat(),
            "teams_count": mother_summary.teams_count,
            "children_count": mother_summary.children_count,
            "seats_in_use": mother_summary.seats_in_use,
            "seats_available": mother_summary.seats_available,
            # 详细信息
            "teams": [{
                "team_id": team.team_id,
                "team_name": team.team_name,
                "is_enabled": team.is_enabled,
                "is_default": team.is_default,
            } for team in mother_summary.teams],
            "children": [{
                "child_id": child.child_id,
                "name": child.name,
                "email": child.email,
                "team_id": child.team_id,
                "team_name": child.team_name,
                "status": child.status,
                "member_id": child.member_id,
                "created_at": child.created_at.isoformat(),
            } for child in mother_summary.children],
        },
        message="查询成功"
    )


@router.put("/mothers/{mother_id}")
@handle_errors
async def update_mother(
    mother_id: int,
    payload: MotherUpdateIn,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    更新Mother账号（复杂业务逻辑示例）

    - 多步骤业务验证
    - 事务处理
    - 审计日志
    """
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    # 验证Mother账号存在
    existing_mother = mother_services.query.get_mother(mother_id)
    if not existing_mother:
        raise MotherNotFoundError(mother_id)

    # 业务逻辑验证
    if payload.status and payload.status == "disabled":
        # 检查是否有已使用的席位
        if existing_mother.seats_in_use > 0:
            raise BusinessError(
                "无法禁用有已使用席位的Mother账号",
                error_code="MOTHER_HAS_USED_SEATS",
                details={
                    "mother_id": mother_id,
                    "seats_in_use": existing_mother.seats_in_use
                }
            )

    # 构建更新载荷
    from app.domains.mother import MotherUpdatePayload, MotherStatusDto

    update_payload = MotherUpdatePayload(
        name=payload.name.strip() if payload.name else None,
        status=MotherStatusDto(payload.status) if payload.status else None,
        seat_limit=payload.seat_limit,
        group_id=payload.group_id,
        pool_group_id=payload.pool_group_id,
        notes=payload.notes,
    )

    try:
        # 使用服务层更新
        updated_summary = mother_services.command.update_mother(mother_id, update_payload)

        # 记录审计日志
        audit_svc.log(
            users_db,
            actor="admin",
            action="update_mother",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Updated mother: {existing_mother.name} -> {updated_summary.name}",
        )

        return ApiResponse.success(
            data={
                "id": updated_summary.id,
                "name": updated_summary.name,
                "status": updated_summary.status.value,
                "seat_limit": updated_summary.seat_limit,
                "seats_available": updated_summary.seats_available,
                "updated_at": updated_summary.updated_at.isoformat(),
            },
            message="Mother账号更新成功"
        )

    except ValueError as e:
        if "不存在" in str(e):
            if "PoolGroup" in str(e):
                from app.utils.error_handler import PoolGroupNotFoundError
                raise PoolGroupNotFoundError(payload.pool_group_id)
        raise BusinessError(f"更新Mother账号失败: {str(e)}")


@router.post("/mothers/{mother_id}/disable")
@handle_errors
async def disable_mother_endpoint(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    禁用Mother账号（业务流程示例）

    - 复杂的业务规则检查
    - 状态转换验证
    - 完整的错误处理
    """
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    # 检查Mother账号存在
    mother = mother_services.query.get_mother(mother_id)
    if not mother:
        raise MotherNotFoundError(mother_id)

    # 业务规则检查
    if mother.status.value == "disabled":
        raise BusinessError(
            "Mother账号已经是禁用状态",
            error_code="MOTHER_ALREADY_DISABLED",
            details={"mother_id": mother_id, "current_status": mother.status.value}
        )

    if mother.seats_in_use > 0:
        raise BusinessError(
            "无法禁用有已使用席位的Mother账号",
            error_code="MOTHER_HAS_USED_SEATS",
            details={
                "mother_id": mother_id,
                "seats_in_use": mother.seats_in_use,
                "available_seats": mother.seats_available
            }
        )

    # 执行禁用操作
    try:
        disabled_mother = mother_services.command.disable_mother(mother_id)

        # 记录审计日志
        audit_svc.log(
            users_db,
            actor="admin",
            action="disable_mother",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Disabled mother: {disabled_mother.name}",
        )

        return ApiResponse.success(
            data={
                "id": disabled_mother.id,
                "name": disabled_mother.name,
                "status": disabled_mother.status.value,
                "disabled_at": datetime.utcnow().isoformat(),
            },
            message="Mother账号已禁用"
        )

    except Exception as e:
        raise BusinessError(f"禁用Mother账号失败: {str(e)}")


# 错误响应示例
@router.get("/mothers/error-demo")
@handle_errors
async def error_demo(request: Request, users_db: Session = Depends(get_db)):
    """
    错误处理演示路由

    展示不同类型的错误如何被处理和返回
    """
    require_admin(request, users_db)

    # 模拟不同类型的错误
    error_type = request.query_params.get("type", "business")

    if error_type == "not_found":
        raise MotherNotFoundError(999)

    if error_type == "business":
        raise BusinessError(
            "这是一个业务逻辑错误示例",
            error_code="BUSINESS_ERROR_DEMO",
            details={"demo_field": "demo_value"}
        )

    if error_type == "validation":
        from app.utils.error_handler import ValidationError
        raise ValidationError(
            "这是一个验证错误示例",
            field="demo_field"
        )

    if error_type == "conflict":
        from app.utils.error_handler import ConflictError
        raise ConflictError(
            "这是一个冲突错误示例",
            details={"conflict_field": "demo_value"}
        )

    # 正常响应
    return ApiResponse.success(
        data={"message": "这是正常响应"},
        message="演示请求处理成功"
    )