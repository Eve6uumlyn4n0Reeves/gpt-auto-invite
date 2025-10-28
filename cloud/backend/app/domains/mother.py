"""
Mother账号相关的领域对象和DTO。

提供数据传输对象，避免直接暴露ORM模型，实现清晰的领域边界。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from enum import Enum

from app.models import MotherStatus


class MotherStatusDto(str, Enum):
    """母号状态的DTO表示"""
    active = "active"
    invalid = "invalid"
    disabled = "disabled"


@dataclass
class MotherTeamSummary:
    """母号团队信息的摘要DTO"""
    team_id: str
    team_name: Optional[str]
    is_enabled: bool
    is_default: bool


@dataclass
class MotherChildSummary:
    """子号信息的摘要DTO"""
    child_id: str
    name: str
    email: str
    team_id: str
    team_name: str
    status: str
    member_id: Optional[str]
    created_at: datetime


@dataclass
class MotherSeatSummary:
    """席位信息的摘要DTO"""
    slot_index: int
    team_id: Optional[str]
    email: Optional[str]
    status: str
    held_until: Optional[datetime]
    invite_request_id: Optional[int]
    invite_id: Optional[str]
    member_id: Optional[str]


@dataclass
class MotherSummary:
    """母号完整信息的摘要DTO"""
    id: int
    name: str
    status: MotherStatusDto
    seat_limit: int
    group_id: Optional[int]
    pool_group_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    # 关联数据
    teams: list[MotherTeamSummary]
    children: list[MotherChildSummary]
    seats: list[MotherSeatSummary]

    # 计算字段
    teams_count: int
    children_count: int
    seats_in_use: int
    seats_available: int


@dataclass
class MotherCreatePayload:
    """创建母号的请求DTO"""
    name: str
    access_token_enc: str
    seat_limit: int = 7
    group_id: Optional[int] = None
    pool_group_id: Optional[int] = None
    notes: Optional[str] = None


@dataclass
class MotherUpdatePayload:
    """更新母号的请求DTO"""
    name: Optional[str] = None
    status: Optional[MotherStatusDto] = None
    seat_limit: Optional[int] = None
    group_id: Optional[int] = None
    pool_group_id: Optional[int] = None
    notes: Optional[str] = None


@dataclass
class MotherListFilters:
    """母号列表查询过滤器"""
    search: Optional[str] = None
    status: Optional[MotherStatusDto] = None
    group_id: Optional[int] = None
    pool_group_id: Optional[int] = None
    has_pool_group: Optional[bool] = None  # True: 只显示已分配到号池组的，False: 只显示未分配的


@dataclass
class MotherListResult:
    """母号列表查询结果"""
    items: list[MotherSummary]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool


@dataclass
class PoolGroupSummary:
    """号池组摘要DTO"""
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # 统计信息
    mothers_count: int
    total_seats: int
    used_seats: int
    children_count: int