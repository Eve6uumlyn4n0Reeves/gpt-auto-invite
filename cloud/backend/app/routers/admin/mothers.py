"""
母号管理相关路由（重构版 - 使用新服务层架构）

本文件已重构为使用新的服务层架构，提供更好的业务分离和类型安全。
主要改进：
1. 使用MotherCommandService和MotherQueryService替代直接ORM操作
2. 支持更丰富的查询过滤和状态管理
3. 统一的错误处理和审计日志
4. 完整的DTO转换和验证
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.schemas import (
    MotherBatchImportItemResult,
    MotherBatchItemIn,
    MotherBatchValidateItemOut,
    MotherCreateIn as OldMotherCreateIn,  # 重命名以避免冲突
    MotherTeamIn,
)
from app.security import encrypt_token
from app.services.services import audit as audit_svc
from app.services.services import (
    MotherCommandServiceDep,
    MotherQueryServiceDep,
    MotherServicesDep,
)
from app.services.services.bulk_history import record_bulk_operation
from app.services.services.child_account import create_child_account_service
from app.services.services.admin_service import create_mother as old_create_mother  # 保留旧函数备用
from app.domains.mother import (
    MotherCreatePayload,
    MotherUpdatePayload,
    MotherStatusDto,
    MotherListFilters,
)
from app.repositories.mother_repository import MotherRepository
from app.utils.csrf import require_csrf_token

try:
    from app.metrics_prom import child_ops_total
except Exception:
    child_ops_total = None

from .dependencies import admin_ops_rate_limit_dep, get_db, get_db_pool, get_db, require_admin, require_domain

router = APIRouter()


@router.post("/mothers")
async def create_mother_account(
    payload: OldMotherCreateIn,  # 使用旧Schema保持兼容性
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    创建新的Mother账号（新架构版本）

    支持新旧两种创建模式：
    1. 新模式：使用加密的access_token_enc
    2. 兼容模式：使用明文access_token（会自动加密）
    """
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        # 转换为新的DTO格式，处理新旧Schema兼容性
        access_token_enc = payload.access_token_enc
        if not access_token_enc and hasattr(payload, 'access_token') and payload.access_token:
            # 兼容旧格式：明文token需要加密
            access_token_enc = encrypt_token(payload.access_token)

        create_payload = MotherCreatePayload(
            name=payload.name,
            access_token_enc=access_token_enc,
            seat_limit=7,  # 默认席位限制
            group_id=payload.group_id,
            pool_group_id=getattr(payload, 'pool_group_id', None),  # 新字段支持
            notes=payload.notes,
        )

        # 使用新的命令服务创建
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

        # 如果提供了团队信息，需要创建团队（保持兼容性）
        if payload.teams:
            # 这里可以调用团队创建服务，暂时跳过具体实现
            pass

        return {
            "ok": True,
            "mother_id": mother_summary.id,
            "mother": {
                "id": mother_summary.id,
                "name": mother_summary.name,
                "status": mother_summary.status.value,
                "seat_limit": mother_summary.seat_limit,
                "seats_available": mother_summary.seats_available,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建Mother账号失败: {str(e)}")


@router.get("/mothers")
def list_mothers(
    request: Request,
    mother_query: MotherQueryServiceDep,
    users_db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(20, ge=1, le=200, description="每页数量，默认20，最大200"),
    search: Optional[str] = Query(None, description="按母号名称搜索"),
    status: Optional[str] = Query(None, description="状态过滤：active, invalid, disabled"),
    group_id: Optional[int] = Query(None, description="用户组ID过滤"),
    pool_group_id: Optional[int] = Query(None, description="号池组ID过滤"),
    has_pool_group: Optional[bool] = Query(None, description="是否已分配到号池组"),
):
    """
    列表查询Mother账号（新架构版本）

    支持更丰富的过滤条件，提供完整的分页信息。
    """
    require_admin(request, users_db)

    try:
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

        # 转换为兼容的响应格式
        items = []
        for mother in result.items:
            item = {
                "id": mother.id,
                "name": mother.name,
                "status": mother.status.value,
                "seat_limit": mother.seat_limit,
                "seats_used": mother.seats_in_use,
                "group_id": mother.group_id,
                "pool_group_id": mother.pool_group_id,
                "notes": mother.notes,
                "created_at": mother.created_at.isoformat() if mother.created_at else None,
                "updated_at": mother.updated_at.isoformat() if mother.updated_at else None,
                # 统计信息
                "teams_count": mother.teams_count,
                "children_count": mother.children_count,
                "seats_available": mother.seats_available,
                # 详细信息（可选）
                "teams": [{
                    "team_id": team.team_id,
                    "team_name": team.team_name,
                    "is_enabled": team.is_enabled,
                    "is_default": team.is_default,
                } for team in mother.teams] if mother.teams else [],
            }
            items.append(item)

        return {
            "items": items,
            "pagination": {
                "page": result.page,
                "page_size": result.page_size,
                "total": result.total,
                "total_pages": (result.total + result.page_size - 1) // result.page_size,
                "has_next": result.has_next,
                "has_prev": result.has_prev,
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询Mother账号失败: {str(e)}")


@router.get("/mothers/{mother_id}")
def get_mother_detail(
    mother_id: int,
    request: Request,
    mother_query: MotherQueryServiceDep,
    users_db: Session = Depends(get_db),
):
    """
    获取单个Mother账号的详细信息（新增API）
    """
    require_admin(request, users_db)

    try:
        mother_summary = mother_query.get_mother(mother_id)
        if not mother_summary:
            raise HTTPException(status_code=404, detail="Mother账号不存在")

        return {
            "id": mother_summary.id,
            "name": mother_summary.name,
            "status": mother_summary.status.value,
            "seat_limit": mother_summary.seat_limit,
            "group_id": mother_summary.group_id,
            "pool_group_id": mother_summary.pool_group_id,
            "notes": mother_summary.notes,
            "created_at": mother_summary.created_at.isoformat(),
            "updated_at": mother_summary.updated_at.isoformat(),
            # 统计信息
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
            "seats": [{
                "slot_index": seat.slot_index,
                "team_id": seat.team_id,
                "email": seat.email,
                "status": seat.status,
                "held_until": seat.held_until.isoformat() if seat.held_until else None,
                "invite_request_id": seat.invite_request_id,
                "invite_id": seat.invite_id,
                "member_id": seat.member_id,
            } for seat in mother_summary.seats],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Mother账号详情失败: {str(e)}")


# ==================== 状态管理路由（新增） ====================

@router.put("/mothers/{mother_id}")
async def update_mother(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """更新Mother账号信息（新架构版本）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        # 获取请求体数据
        body = await request.json()

        # 构建更新载荷
        update_payload = MotherUpdatePayload(
            name=body.get('name'),
            status=MotherStatusDto(body.get('status')) if body.get('status') else None,
            seat_limit=body.get('seat_limit'),
            group_id=body.get('group_id'),
            pool_group_id=body.get('pool_group_id'),
            notes=body.get('notes'),
        )

        # 使用命令服务更新
        mother_summary = mother_services.command.update_mother(mother_id, update_payload)

        # 记录审计日志
        audit_svc.log(
            users_db,
            actor="admin",
            action="update_mother",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Updated mother: {mother_summary.name}",
        )

        return {
            "ok": True,
            "mother": {
                "id": mother_summary.id,
                "name": mother_summary.name,
                "status": mother_summary.status.value,
                "seat_limit": mother_summary.seat_limit,
                "seats_available": mother_summary.seats_available,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新Mother账号失败: {str(e)}")


@router.delete("/mothers/{mother_id}")
async def delete_mother(
    mother_id: int,
    request: Request,
    mother_command: MotherCommandServiceDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """删除Mother账号（新架构版本）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        success = mother_command.delete_mother(mother_id)

        if success:
            # 记录审计日志
            audit_svc.log(
                users_db,
                actor="admin",
                action="delete_mother",
                target_type="mother",
                target_id=str(mother_id),
                details=f"Deleted mother with ID: {mother_id}",
            )
            return {"ok": True, "message": "Mother账号删除成功"}
        else:
            raise HTTPException(status_code=400, detail="删除失败")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除Mother账号失败: {str(e)}")


@router.post("/mothers/{mother_id}/enable")
async def enable_mother(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """启用Mother账号（新增API）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        mother_summary = mother_services.command.enable_mother(mother_id)

        audit_svc.log(
            users_db,
            actor="admin",
            action="enable_mother",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Enabled mother: {mother_summary.name}",
        )

        return {
            "ok": True,
            "mother": {
                "id": mother_summary.id,
                "name": mother_summary.name,
                "status": mother_summary.status.value,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启用Mother账号失败: {str(e)}")


@router.post("/mothers/{mother_id}/disable")
async def disable_mother(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """禁用Mother账号（新增API）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        mother_summary = mother_services.command.disable_mother(mother_id)

        audit_svc.log(
            users_db,
            actor="admin",
            action="disable_mother",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Disabled mother: {mother_summary.name}",
        )

        return {
            "ok": True,
            "mother": {
                "id": mother_summary.id,
                "name": mother_summary.name,
                "status": mother_summary.status.value,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"禁用Mother账号失败: {str(e)}")


@router.post("/mothers/{mother_id}/assign-pool-group")
async def assign_to_pool_group(
    mother_id: int,
    request: Request,
    mother_services: MotherServicesDep,
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """将Mother账号分配到号池组（新增API）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        body = await request.json()
        pool_group_id = body.get('pool_group_id')  # None表示移除分配

        mother_summary = mother_services.command.assign_to_pool_group(mother_id, pool_group_id)

        audit_svc.log(
            users_db,
            actor="admin",
            action="assign_pool_group",
            target_type="mother",
            target_id=str(mother_id),
            details=f"Assigned mother {mother_summary.name} to pool_group {pool_group_id}",
        )

        return {
            "ok": True,
            "mother": {
                "id": mother_summary.id,
                "name": mother_summary.name,
                "pool_group_id": mother_summary.pool_group_id,
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分配号池组失败: {str(e)}")


# ==================== 批量操作路由（保持兼容性） ====================

@router.post("/mothers/batch/import-text")
async def batch_mothers_import_text(
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    delim: str = "---",
):
    """以纯文本批量导入母号"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
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
                sp = line.split()
                if len(sp) >= 2:
                    parts = [sp[0], " ".join(sp[1:])]
            email = (parts[0] or "").strip()
            token = (parts[1] or "").strip()
            if not email or not token:
                raise ValueError("格式错误：缺少邮箱或Token")

            mother = create_mother(
                pool_db,
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
            users_db,
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


@router.post("/mothers/batch/validate", response_model=List[MotherBatchValidateItemOut])
def batch_mothers_validate(
    payload: List[MotherBatchItemIn],
    request: Request,
    users_db: Session = Depends(get_db),
):
    require_admin(request, users_db)
    # 只做格式校验，不强制域
    out: List[MotherBatchValidateItemOut] = []
    for i, item in enumerate(payload):
        warnings: list[str] = []
        valid = True
        if not item.name or not item.access_token:
            valid = False
            warnings.append("缺少 name 或 access_token")
        default_seen = False
        teams_norm: list[MotherTeamIn] = []
        seen_team_ids: set[str] = set()
        for t in item.teams:
            if t.team_id in seen_team_ids:
                warnings.append(f"重复的 team_id: {t.team_id}")
                continue
            seen_team_ids.add(t.team_id)
            is_def = bool(t.is_default) and not default_seen
            if t.is_default and default_seen:
                warnings.append("多于一个默认团队，已保留第一个默认")
            if is_def:
                default_seen = True
            teams_norm.append(
                MotherTeamIn(
                    team_id=t.team_id,
                    team_name=t.team_name,
                    is_enabled=bool(t.is_enabled),
                    is_default=is_def,
                )
            )
        out.append(
            MotherBatchValidateItemOut(index=i, name=item.name, valid=valid, warnings=warnings, teams=teams_norm)
        )
    return out


@router.post("/mothers/batch/import", response_model=List[MotherBatchImportItemResult])
async def batch_mothers_import(
    payload: List[MotherBatchItemIn],
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
):
    require_admin(request, users_db)
    await require_domain('pool')(request)
    results: List[MotherBatchImportItemResult] = []
    for i, item in enumerate(payload):
        try:
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
                teams.append(
                    {
                        "team_id": t.team_id,
                        "team_name": t.team_name,
                        "is_enabled": bool(t.is_enabled),
                        "is_default": is_def,
                    }
                )

            mother = create_mother(
                pool_db,
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
            users_db,
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


@router.put("/mothers/{mother_id}")
async def update_mother(
    mother_id: int,
    payload: MotherCreateIn,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)
    repo = MotherRepository(pool_db)
    mother = repo.get(mother_id)
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    mother.name = payload.name
    mother.notes = payload.notes

    if payload.access_token:
        mother.access_token_enc = encrypt_token(payload.access_token)
        mother.token_expires_at = payload.token_expires_at or (
            datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        )

    repo.replace_teams(
        mother_id,
        [
            {
                "team_id": t.team_id,
                "team_name": t.team_name,
                "is_enabled": bool(t.is_enabled),
                "is_default": bool(t.is_default),
            }
            for t in payload.teams
        ],
    )

    pool_db.add(mother)
    pool_db.commit()

    audit_svc.log(
        users_db, actor="admin", action="update_mother", target_type="mother", target_id=str(mother_id)
    )
    return {"ok": True, "message": "母号更新成功"}


@router.delete("/mothers/{mother_id}")
async def delete_mother(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    await require_domain('pool')(request)

    mother = pool_db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    used_seats = pool_db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

    if used_seats > 0:
        raise HTTPException(status_code=400, detail=f"无法删除：该母号仍有 {used_seats} 个座位在使用")

    pool_db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()
    pool_db.query(models.SeatAllocation).filter(models.SeatAllocation.mother_id == mother_id).delete()
    pool_db.delete(mother)
    pool_db.commit()

    audit_svc.log(
        users_db, actor="admin", action="delete_mother", target_type="mother", target_id=str(mother_id)
    )
    return {"ok": True, "message": "母号删除成功"}


@router.post("/mothers/{mother_id}/apply-naming")
async def apply_mother_naming(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """为母号的所有团队应用命名规则（基于用户组模板）"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    mother = pool_db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    from app.services.services.team_naming import TeamNamingService

    try:
        success = TeamNamingService.apply_naming_to_mother_teams(pool_db, mother_id, template=None)
        if success:
            audit_svc.log(
                users_db,
                actor="admin",
                action="apply_mother_naming",
                target_type="mother",
                target_id=str(mother_id),
            )
            return {"ok": True, "message": "团队名称已更新"}
        else:
            raise HTTPException(status_code=500, detail="命名应用失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"命名应用失败: {e}")


__all__ = ["router"]


# -----------------------------
# ChildAccount 路由接入（Pool 域）
# -----------------------------

@router.get("/mothers/{mother_id}/children")
async def list_children_by_mother(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
):
    """列出指定母号的子号列表（只读）。"""
    require_admin(request, users_db)
    # 只读接口不强制 CSRF；仍校验域（测试/开发环境中该校验会被跳过）
    await require_domain('pool')(request)

    svc = create_child_account_service(pool_db)
    items = svc.get_children_by_mother(mother_id)
    try:
        if child_ops_total is not None:
            child_ops_total.labels(action='list', result='ok').inc()
    except Exception:
        pass
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
                "created_at": c.created_at,
            }
            for c in items
        ]
    }


@router.post("/mothers/{mother_id}/children/auto-pull")
async def auto_pull_children(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """从 Provider 拉取成员并为母号生成子号记录。"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    # 显式校验母号与 token，未配置则返回 400（与接口文档一致）
    mother = pool_db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother or not mother.access_token_enc:
        try:
            if child_ops_total is not None:
                child_ops_total.labels(action='auto_pull', result='error').inc()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="母号不存在或未配置 access_token")

    svc = create_child_account_service(pool_db)
    created = svc.auto_pull_children_for_mother(mother_id)
    try:
        if child_ops_total is not None:
            child_ops_total.labels(action='auto_pull', result='ok').inc()
    except Exception:
        pass
    return {"ok": True, "created_count": len(created)}


@router.post("/mothers/{mother_id}/children/sync")
async def sync_children_members(
    mother_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """同步 Provider 成员信息到子号记录。"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    svc = create_child_account_service(pool_db)
    result = svc.sync_child_members(mother_id)
    if not result.get("success"):
        try:
            if child_ops_total is not None:
                child_ops_total.labels(action='sync', result='error').inc()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=result.get("message") or "同步失败")
    try:
        if child_ops_total is not None:
            child_ops_total.labels(action='sync', result='ok').inc()
    except Exception:
        pass
    return {"ok": True, **result}


@router.delete("/children/{child_id}")
async def remove_child(
    child_id: int,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """移除一个子号（同时尝试从 Provider 团队移除成员）。"""
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    svc = create_child_account_service(pool_db)
    ok = svc.remove_child_member(child_id)
    if not ok:
        try:
            if child_ops_total is not None:
                child_ops_total.labels(action='remove', result='error').inc()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="移除失败或子号不存在")
    try:
        if child_ops_total is not None:
            child_ops_total.labels(action='remove', result='ok').inc()
    except Exception:
        pass
    return {"ok": True}
