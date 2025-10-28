"""
ChildAccount相关的领域对象和DTO。

提供数据传输对象，避免直接暴露ORM模型，实现清晰的领域边界。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from enum import Enum


class ChildAccountStatus(str, Enum):
    """子号状态枚举"""
    active = "active"
    inactive = "inactive"
    suspended = "suspended"


@dataclass
class ChildAccountSummary:
    """子账号摘要DTO"""
    id: int
    child_id: str
    name: str
    email: str
    mother_id: int
    team_id: str
    team_name: str
    status: ChildAccountStatus
    member_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    # 关联信息
    mother_name: Optional[str] = None
    mother_status: Optional[str] = None


@dataclass
class ChildAccountCreatePayload:
    """创建子账号的请求DTO"""
    child_id: str
    name: str
    email: str
    mother_id: int
    team_id: str
    team_name: str
    status: ChildAccountStatus = ChildAccountStatus.active
    member_id: Optional[str] = None


@dataclass
class ChildAccountUpdatePayload:
    """更新子账号的请求DTO"""
    name: Optional[str] = None
    status: Optional[ChildAccountStatus] = None
    team_name: Optional[str] = None
    member_id: Optional[str] = None


@dataclass
class ChildAccountListFilters:
    """子账号列表查询过滤器"""
    search: Optional[str] = None
    status: Optional[ChildAccountStatus] = None
    mother_id: Optional[int] = None
    team_id: Optional[str] = None
    has_member_id: Optional[bool] = None  # True: 已关联member_id, False: 未关联


@dataclass
class ChildAccountListResult:
    """子账号列表查询结果"""
    items: list[ChildAccountSummary]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool


@dataclass
class ChildAccountAutoPullResult:
    """自动拉取子账号结果DTO"""
    mother_id: int
    team_id: str
    pulled_count: int
    updated_count: int
    skipped_count: int
    errors: list[str]


@dataclass
class ChildAccountSyncResult:
    """同步子账号结果DTO"""
    mother_id: int
    team_id: str
    total_children: int
    synced_count: int
    updated_count: int
    created_count: int
    errors: list[str]