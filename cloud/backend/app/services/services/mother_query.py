"""
Mother账号的查询服务。

负责Mother账号的查询、统计等读操作，仅操作Pool数据库。
返回DTO对象，避免直接暴露ORM模型。
"""

from __future__ import annotations

from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.repositories.mother_repository import MotherRepository
from app.repositories.pool_repository import PoolRepository
from app import models
from app.domains.mother import (
    MotherSummary,
    MotherListFilters,
    MotherListResult,
    PoolGroupSummary,
    MotherStatusDto,
)


class MotherQueryService:
    """Mother账号的查询服务，负责所有读操作"""

    def __init__(
        self,
        pool_session: Session,
        mother_repository: Optional[MotherRepository] = None,
        pool_repository: Optional[PoolRepository] = None,
    ):
        self._session = pool_session
        self._mother_repo = mother_repository or MotherRepository(pool_session)
        self._pool_repo = pool_repository or PoolRepository(pool_session)

    def get_mother(self, mother_id: int) -> Optional[MotherSummary]:
        """
        获取单个Mother账号的详细信息

        Args:
            mother_id: Mother账号ID

        Returns:
            MotherSummary: Mother账号摘要信息，不存在时返回None
        """
        return self._mother_repo.get_mother_summary(mother_id)

    def list_mothers(
        self,
        filters: MotherListFilters,
        page: int = 1,
        page_size: int = 20,
    ) -> MotherListResult:
        """
        分页查询Mother账号列表

        Args:
            filters: 查询过滤器
            page: 页码，从1开始
            page_size: 每页大小

        Returns:
            MotherListResult: 分页查询结果
        """
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20

        mothers, total = self._mother_repo.list_mothers_paginated(
            filters=filters,
            offset=(page - 1) * page_size,
            limit=page_size,
        )

        items = [self._mother_repo.build_mother_summary(mother) for mother in mothers]

        return MotherListResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_next=page * page_size < total,
            has_prev=page > 1,
        )

    def search_mothers(self, query: str, limit: int = 10) -> List[MotherSummary]:
        """
        搜索Mother账号（简单搜索）

        Args:
            query: 搜索关键词
            limit: 结果数量限制

        Returns:
            List[MotherSummary]: 匹配的Mother账号列表
        """
        filters = MotherListFilters(search=query)
        mothers, _ = self._mother_repo.list_mothers_paginated(
            filters=filters,
            offset=0,
            limit=limit,
        )

        return [self._mother_repo.build_mother_summary(mother) for mother in mothers]

    def get_mothers_by_pool_group(self, pool_group_id: int) -> List[MotherSummary]:
        """
        获取指定号池组下的所有Mother账号

        Args:
            pool_group_id: 号池组ID

        Returns:
            List[MotherSummary]: Mother账号列表
        """
        filters = MotherListFilters(pool_group_id=pool_group_id)
        mothers, _ = self._mother_repo.list_mothers_paginated(
            filters=filters,
            offset=0,
            limit=1000,  # 足够大的限制
        )

        return [self._mother_repo.build_mother_summary(mother) for mother in mothers]

    def get_mothers_without_pool_group(self) -> List[MotherSummary]:
        """
        获取未分配到号池组的Mother账号

        Returns:
            List[MotherSummary]: Mother账号列表
        """
        filters = MotherListFilters(has_pool_group=False)
        mothers, _ = self._mother_repo.list_mothers_paginated(
            filters=filters,
            offset=0,
            limit=1000,
        )

        return [self._mother_repo.build_mother_summary(mother) for mother in mothers]

    def get_quota_metrics(self) -> dict:
        """
        获取配额统计信息

        Returns:
            dict: 包含各种统计指标的字典
        """
        # 基础统计
        total_mothers = (
            self._session.query(func.count(models.MotherAccount.id))
            .filter(models.MotherAccount.status != models.MotherStatus.disabled)
            .scalar()
        )

        active_mothers = (
            self._session.query(func.count(models.MotherAccount.id))
            .filter(models.MotherAccount.status == models.MotherStatus.active)
            .scalar()
        )

        invalid_mothers = (
            self._session.query(func.count(models.MotherAccount.id))
            .filter(models.MotherAccount.status == models.MotherStatus.invalid)
            .scalar()
        )

        # 席位统计
        total_seats = (
            self._session.query(func.sum(models.MotherAccount.seat_limit))
            .filter(models.MotherAccount.status != models.MotherStatus.disabled)
            .scalar()
            or 0
        )

        used_seats = (
            self._session.query(func.count(models.SeatAllocation.id))
            .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
            .join(models.MotherAccount, models.SeatAllocation.mother_id == models.MotherAccount.id)
            .filter(models.MotherAccount.status != models.MotherStatus.disabled)
            .scalar()
        )

        available_seats = total_seats - used_seats

        # 号池组统计
        total_pool_groups = self._session.query(func.count(models.PoolGroup.id)).scalar()
        active_pool_groups = (
            self._session.query(func.count(models.PoolGroup.id))
            .filter(models.PoolGroup.is_active == True)
            .scalar()
        )

        # 子号统计
        total_children = (
            self._session.query(func.count(models.ChildAccount.id))
            .join(models.MotherAccount, models.ChildAccount.mother_id == models.MotherAccount.id)
            .filter(models.MotherAccount.status != models.MotherStatus.disabled)
            .scalar()
        )

        active_children = (
            self._session.query(func.count(models.ChildAccount.id))
            .join(models.MotherAccount, models.ChildAccount.mother_id == models.MotherAccount.id)
            .filter(
                models.MotherAccount.status != models.MotherStatus.disabled,
                models.ChildAccount.status == 'active',
            )
            .scalar()
        )

        return {
            "mothers": {
                "total": total_mothers,
                "active": active_mothers,
                "invalid": invalid_mothers,
                "disabled": total_mothers - active_mothers - invalid_mothers,
            },
            "seats": {
                "total": total_seats,
                "used": used_seats,
                "available": available_seats,
                "utilization_rate": round(used_seats / total_seats * 100, 2) if total_seats > 0 else 0,
            },
            "pool_groups": {
                "total": total_pool_groups,
                "active": active_pool_groups,
            },
            "children": {
                "total": total_children,
                "active": active_children,
            },
        }

    def get_pool_group_summary(self, pool_group_id: int) -> Optional[PoolGroupSummary]:
        """
        获取号池组的摘要信息

        Args:
            pool_group_id: 号池组ID

        Returns:
            PoolGroupSummary: 号池组摘要信息，不存在时返回None
        """
        pool_group = self._session.get(models.PoolGroup, pool_group_id)
        if not pool_group:
            return None

        # 统计信息
        mothers_count = (
            self._session.query(func.count(models.MotherAccount.id))
            .filter(models.MotherAccount.pool_group_id == pool_group_id)
            .scalar()
        )

        total_seats = (
            self._session.query(func.sum(models.MotherAccount.seat_limit))
            .filter(models.MotherAccount.pool_group_id == pool_group_id)
            .scalar()
            or 0
        )

        used_seats = (
            self._session.query(func.count(models.SeatAllocation.id))
            .filter(models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]))
            .join(models.MotherAccount, models.SeatAllocation.mother_id == models.MotherAccount.id)
            .filter(models.MotherAccount.pool_group_id == pool_group_id)
            .scalar()
        )

        children_count = (
            self._session.query(func.count(models.ChildAccount.id))
            .join(models.MotherAccount, models.ChildAccount.mother_id == models.MotherAccount.id)
            .filter(models.MotherAccount.pool_group_id == pool_group_id)
            .scalar()
        )

        return PoolGroupSummary(
            id=pool_group.id,
            name=pool_group.name,
            description=pool_group.description,
            is_active=pool_group.is_active,
            created_at=pool_group.created_at,
            updated_at=pool_group.updated_at,
            mothers_count=mothers_count,
            total_seats=total_seats or 0,
            used_seats=used_seats or 0,
            children_count=children_count or 0,
        )

    def list_pool_groups_summaries(self) -> List[PoolGroupSummary]:
        """
        获取所有号池组的摘要信息列表

        Returns:
            List[PoolGroupSummary]: 号池组摘要信息列表
        """
        pool_groups = self._session.query(models.PoolGroup).order_by(models.PoolGroup.name).all()

        summaries = []
        for pool_group in pool_groups:
            summary = self.get_pool_group_summary(pool_group.id)
            if summary:
                summaries.append(summary)

        return summaries

    def get_mother_status_distribution(self) -> dict:
        """
        获取Mother账号状态分布

        Returns:
            dict: 状态分布统计
        """
        status_counts = (
            self._session.query(
                models.MotherAccount.status,
                func.count(models.MotherAccount.id).label('count'),
            )
            .group_by(models.MotherAccount.status)
            .all()
        )

        distribution = {status.value: 0 for status in models.MotherStatus}
        for status, count in status_counts:
            distribution[status.value] = count

        return distribution