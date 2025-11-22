"""
管理员服务（重构版 - 使用新服务层架构）

重构原有的admin.py中的直接ORM操作，改为使用新的服务层架构。
提供向后兼容的接口，同时内部使用新的DTO和服务层。
"""

from __future__ import annotations

import warnings
from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from functools import wraps

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.security import encrypt_token
from app.services.services.mother_command import MotherCommandService
from app.services.services.mother_query import MotherQueryService
from app.domains.mother import (
    MotherCreatePayload,
    MotherStatusDto,
    MotherListFilters,
    MotherSummary,
)
from app.repositories.mother_repository import MotherRepository


def deprecated(replacement: str):
    """标记函数为废弃，并提示使用替代方案"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            warnings.warn(
                f"{func.__name__} is deprecated. Use {replacement} instead.",
                DeprecationWarning,
                stacklevel=2
            )
            return func(*args, **kwargs)
        return wrapper
    return decorator


def create_or_update_admin_default(db: Session, password_hash: str):
    """
    创建或更新默认管理员配置（保持不变）

    这个函数不涉及Mother业务，保持原样。
    """
    row = db.query(models.AdminConfig).first()
    if not row:
        row = models.AdminConfig(password_hash=password_hash)
        db.add(row)
    db.commit()
    return row


@deprecated("MotherCommandService.create_mother() 或 create_mother_with_service()")
def create_mother(
    db: Session,
    name: str,
    access_token: str,
    token_expires_at: Optional[datetime],
    teams: List[dict],
    notes: Optional[str],
    group_id: Optional[int] = None,
):
    """
    创建母号（已废弃 - 仅用于向后兼容）

    .. deprecated::
        此函数已废弃，请使用以下替代方案：
        - 推荐：直接使用 MotherCommandService.create_mother()
        - 或使用：create_mother_with_service() 便利函数

    保持原有的函数签名，但内部使用新的MotherCommandService。
    这个函数主要用于向后兼容，新代码应直接使用新服务层。

    Args:
        db: Pool Session（必须是 Pool 数据库会话）
        name: 母号名称
        access_token: 访问令牌（明文，将被加密）
        token_expires_at: 令牌过期时间
        teams: 团队列表
        notes: 备注
        group_id: 母号分组 ID

    Returns:
        创建的 Mother 账号 ORM 对象或 MotherSummary
    """
    # 加密访问令牌
    mtokens = encrypt_token(access_token)
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None

    mother_repo = MotherRepository(db)
    mother_command = MotherCommandService(db, mother_repo)

    create_payload = MotherCreatePayload(
        name=name,
        access_token_enc=mtokens,
        seat_limit=7,  # 默认席位限制
        group_id=group_id,
        pool_group_id=None,
        notes=notes,
    )

    summary = mother_command.create_mother(create_payload)
    mother_orm = db.query(models.MotherAccount).filter(models.MotherAccount.id == summary.id).first()

    if teams:
        mother_repo.replace_teams(summary.id, teams)
        db.commit()
        if mother_orm:
            db.refresh(mother_orm)

    return mother_orm or summary


def _mother_summary_to_admin_dict(summary: MotherSummary) -> dict:
    """将 MotherSummary 转换为管理端列表所需的字典结构。"""
    return {
        "id": summary.id,
        "name": summary.name,
        "status": summary.status.value,
        "seat_limit": summary.seat_limit,
        "seats_used": summary.seats_in_use,
        "token_expires_at": summary.token_expires_at.isoformat() if summary.token_expires_at else None,
        "notes": summary.notes,
        "group_id": summary.group_id,
        "pool_group_id": summary.pool_group_id,
        "teams": [
            {
                "team_id": team.team_id,
                "team_name": team.team_name,
                "is_enabled": team.is_enabled,
                "is_default": team.is_default,
            }
            for team in summary.teams
        ],
    }


def compute_mother_seats_used(db: Session, mother_id: int) -> int:
    """计算母号已使用席位数量（使用查询服务）"""
    mother_repo = MotherRepository(db)
    mother_query = MotherQueryService(db, mother_repo)

    mother_summary = mother_query.get_mother(mother_id)
    if not mother_summary:
        return 0

    return mother_summary.seats_in_use


@deprecated("MotherQueryService.list_mothers() 或 list_mothers_with_service()")
def list_mothers_with_usage(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status: Optional[str] = None,
    group_id: Optional[int] = None,
    pool_group_id: Optional[int] = None,
) -> Tuple[List[dict], int, int, int]:
    """
    列出母号及使用情况（已废弃 - 仅用于向后兼容）

    .. deprecated::
        此函数已废弃，请使用以下替代方案：
        - 推荐：直接使用 MotherQueryService.list_mothers()
        - 或使用：list_mothers_with_service(as_dict=True) 便利函数

    保持原有的函数签名和返回格式，但内部使用新的查询服务。

    Args:
        db: Pool Session（必须是 Pool 数据库会话）
        page: 页码
        page_size: 每页大小
        search: 搜索关键词
        status: 状态过滤
        group_id: 母号分组 ID
        pool_group_id: 号池组 ID

    Returns:
        Tuple[items, total, page, total_pages]
    """
    mother_repo = MotherRepository(db)
    mother_query = MotherQueryService(db, mother_repo)

    filters = MotherListFilters(
        search=search,
        status=MotherStatusDto(status) if status else None,
        group_id=group_id,
        pool_group_id=pool_group_id,
    )

    result = mother_query.list_mothers(filters, page, page_size)

    items = [_mother_summary_to_admin_dict(summary) for summary in result.items]

    total_pages = (result.total + page_size - 1) // page_size if page_size else 0

    return items, result.total, result.page, total_pages


# ==================== 新增的便利函数 ====================

def create_mother_with_service(
    mother_command: MotherCommandService,
    name: str,
    access_token: str,
    token_expires_at: Optional[datetime] = None,
    seat_limit: int = 7,
    group_id: Optional[int] = None,
    pool_group_id: Optional[int] = None,
    notes: Optional[str] = None,
):
    """
    使用新服务层创建Mother账号（推荐使用）

    这是推荐的新版本创建函数，直接使用注入的服务实例。
    """
    mtokens = encrypt_token(access_token)
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None

    create_payload = MotherCreatePayload(
        name=name,
        access_token_enc=mtokens,
        seat_limit=seat_limit,
        group_id=group_id,
        pool_group_id=pool_group_id,
        notes=notes,
    )

    return mother_command.create_mother(create_payload)


def get_mother_summary_with_service(
    mother_query: MotherQueryService,
    mother_id: int,
):
    """
    使用新服务层获取Mother账号摘要（推荐使用）
    """
    return mother_query.get_mother(mother_id)


def list_mothers_with_service(
    mother_query: MotherQueryService,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status: Optional[MotherStatusDto] = None,
    group_id: Optional[int] = None,
    pool_group_id: Optional[int] = None,
    has_pool_group: Optional[bool] = None,
    as_dict: bool = False,
):
    """
    使用新服务层列表查询Mother账号（推荐使用）

    Args:
        mother_query: 查询服务实例
        page/page_size/...: 查询参数
        as_dict: True 时返回管理端所需的字典结构和分页信息
    """
    filters = MotherListFilters(
        search=search,
        status=status,
        group_id=group_id,
        pool_group_id=pool_group_id,
        has_pool_group=has_pool_group,
    )

    result = mother_query.list_mothers(filters, page, page_size)
    if not as_dict:
        return result

    return {
        "items": [_mother_summary_to_admin_dict(summary) for summary in result.items],
        "total": result.total,
        "page": result.page,
        "page_size": result.page_size,
        "has_next": result.has_next,
        "has_prev": result.has_prev,
    }
