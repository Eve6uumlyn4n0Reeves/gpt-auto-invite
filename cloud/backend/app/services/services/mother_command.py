"""
Mother账号的命令服务。

负责Mother账号的创建、更新、删除等写操作，仅操作Pool数据库。
遵循领域驱动设计原则，通过Repository模式访问数据，返回DTO对象。
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session
from app.repositories.mother_repository import MotherRepository
from app.repositories.pool_repository import PoolRepository
from app.domains.mother import (
    MotherCreatePayload,
    MotherUpdatePayload,
    MotherSummary,
    MotherStatusDto,
)
from app import models
from app.security import encrypt_token
from app.services.services.team_naming import TeamNamingService


class MotherCommandService:
    """Mother账号的命令服务，负责所有写操作"""

    def __init__(
        self,
        pool_session: Session,
        mother_repository: Optional[MotherRepository] = None,
        pool_repository: Optional[PoolRepository] = None,
    ):
        self._session = pool_session
        self._mother_repo = mother_repository or MotherRepository(pool_session)
        self._pool_repo = pool_repository or PoolRepository(pool_session)

    def create_mother(self, payload: MotherCreatePayload) -> MotherSummary:
        """
        创建新的Mother账号

        Args:
            payload: 创建Mother的请求数据

        Returns:
            MotherSummary: 创建的Mother账号摘要信息

        Raises:
            ValueError: 当提供的group_id或pool_group_id不存在时
        """
        # 验证关联的组是否存在
        if payload.group_id is not None:
            group = self._session.get(models.MotherGroup, payload.group_id)
            if not group:
                raise ValueError(f"MotherGroup {payload.group_id} 不存在")

        if payload.pool_group_id is not None:
            pool_group = self._session.get(models.PoolGroup, payload.pool_group_id)
            if not pool_group:
                raise ValueError(f"PoolGroup {payload.pool_group_id} 不存在")

        # 创建Mother账号
        mother = models.MotherAccount(
            name=payload.name,
            access_token_enc=payload.access_token_enc,
            seat_limit=payload.seat_limit,
            group_id=payload.group_id,
            pool_group_id=payload.pool_group_id,
            notes=payload.notes,
            status=models.MotherStatus.active,
        )

        self._session.add(mother)
        self._session.flush()

        # 创建席位分配
        for slot_index in range(1, payload.seat_limit + 1):
            seat = models.SeatAllocation(
                mother_id=mother.id,
                slot_index=slot_index,
                status=models.SeatStatus.free,
            )
            self._session.add(seat)

        self._session.commit()

        # 返回摘要信息
        return self._mother_repo.get_mother_summary(mother.id)

    def update_mother(self, mother_id: int, payload: MotherUpdatePayload) -> MotherSummary:
        """
        更新Mother账号信息

        Args:
            mother_id: Mother账号ID
            payload: 更新数据

        Returns:
            MotherSummary: 更新后的Mother账号摘要信息

        Raises:
            ValueError: 当Mother账号不存在或关联的组不存在时
        """
        mother = self._mother_repo.get_mother(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        # 验证关联的组是否存在
        if payload.group_id is not None and payload.group_id != mother.group_id:
            if payload.group_id:
                group = self._session.get(models.MotherGroup, payload.group_id)
                if not group:
                    raise ValueError(f"MotherGroup {payload.group_id} 不存在")
            mother.group_id = payload.group_id

        if payload.pool_group_id is not None and payload.pool_group_id != mother.pool_group_id:
            if payload.pool_group_id:
                pool_group = self._session.get(models.PoolGroup, payload.pool_group_id)
                if not pool_group:
                    raise ValueError(f"PoolGroup {payload.pool_group_id} 不存在")
            mother.pool_group_id = payload.pool_group_id

        # 更新字段
        if payload.name is not None:
            mother.name = payload.name
        if payload.status is not None:
            mother.status = models.MotherStatus(payload.status.value)
        if payload.seat_limit is not None and payload.seat_limit != mother.seat_limit:
            self._update_seat_limit(mother, payload.seat_limit)
        if payload.notes is not None:
            mother.notes = payload.notes

        mother.updated_at = datetime.utcnow()
        self._session.commit()

        return self._mother_repo.get_mother_summary(mother_id)

    def _update_seat_limit(self, mother: models.MotherAccount, new_limit: int) -> None:
        """更新席位限制"""
        current_limit = mother.seat_limit
        mother.seat_limit = new_limit

        if new_limit > current_limit:
            # 增加席位
            for slot_index in range(current_limit + 1, new_limit + 1):
                seat = models.SeatAllocation(
                    mother_id=mother.id,
                    slot_index=slot_index,
                    status=models.SeatStatus.free,
                )
                self._session.add(seat)
        elif new_limit < current_limit:
            # 减少席位（只能删除空闲的席位）
            seats_to_remove = (
                self._session.query(models.SeatAllocation)
                .filter(
                    models.SeatAllocation.mother_id == mother.id,
                    models.SeatAllocation.slot_index > new_limit,
                    models.SeatAllocation.status == models.SeatStatus.free,
                )
                .all()
            )

            if len(seats_to_remove) != (current_limit - new_limit):
                raise ValueError("无法减少席位限制：存在已使用的席位")

            for seat in seats_to_remove:
                self._session.delete(seat)

    def delete_mother(self, mother_id: int) -> bool:
        """
        删除Mother账号

        Args:
            mother_id: Mother账号ID

        Returns:
            bool: 是否成功删除

        Raises:
            ValueError: 当Mother账号不存在或存在已使用席位时
        """
        mother = self._mother_repo.get_mother(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        # 检查是否有已使用的席位
        used_seats = (
            self._session.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.mother_id == mother_id,
                models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
            )
            .count()
        )

        if used_seats > 0:
            raise ValueError("无法删除Mother账号：存在已使用的席位")

        # 检查是否有子号
        children_count = (
            self._session.query(models.ChildAccount)
            .filter(models.ChildAccount.mother_id == mother_id)
            .count()
        )

        if children_count > 0:
            raise ValueError("无法删除Mother账号：存在关联的子号")

        # 删除Mother账号（级联删除团队和空闲席位）
        self._session.delete(mother)
        self._session.commit()

        return True

    def assign_to_pool_group(self, mother_id: int, pool_group_id: Optional[int]) -> MotherSummary:
        """
        将Mother账号分配到号池组

        Args:
            mother_id: Mother账号ID
            pool_group_id: 号池组ID，None表示移除分配

        Returns:
            MotherSummary: 更新后的Mother账号摘要信息
        """
        mother = self._mother_repo.get_mother(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        if pool_group_id is not None:
            pool_group = self._session.get(models.PoolGroup, pool_group_id)
            if not pool_group:
                raise ValueError(f"PoolGroup {pool_group_id} 不存在")

        mother.pool_group_id = pool_group_id
        mother.updated_at = datetime.utcnow()
        self._session.commit()

        return self._mother_repo.get_mother_summary(mother_id)

    def disable_mother(self, mother_id: int) -> MotherSummary:
        """禁用Mother账号"""
        return self._update_mother_status(mother_id, MotherStatusDto.disabled)

    def enable_mother(self, mother_id: int) -> MotherSummary:
        """启用Mother账号"""
        return self._update_mother_status(mother_id, MotherStatusDto.active)

    def mark_mother_invalid(self, mother_id: int) -> MotherSummary:
        """标记Mother账号为无效（token过期等）"""
        return self._update_mother_status(mother_id, MotherStatusDto.invalid)

    def _update_mother_status(self, mother_id: int, status: MotherStatusDto) -> MotherSummary:
        """更新Mother账号状态"""
        mother = self._mother_repo.get_mother(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        mother.status = models.MotherStatus(status.value)
        mother.updated_at = datetime.utcnow()
        self._session.commit()

        return self._mother_repo.get_mother_summary(mother_id)