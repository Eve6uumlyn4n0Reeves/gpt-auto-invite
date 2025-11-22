from __future__ import annotations

from typing import Iterable, List, Optional, Sequence

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session, joinedload

from app import models
from app.domains.mother import MotherSummary, MotherListFilters


class MotherRepository:
    """Pool 库母号相关访问封装。"""

    def __init__(self, session: Session):
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    # CRUD
    def add(self, entity: models.MotherAccount) -> None:
        self._session.add(entity)

    def flush(self) -> None:
        self._session.flush()

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()

    # Queries
    def get(self, mother_id: int) -> Optional[models.MotherAccount]:
        return self._session.get(models.MotherAccount, mother_id)

    def find_by_email(self, email: str) -> Optional[models.MotherAccount]:
        return (
            self._session.query(models.MotherAccount)
            .filter(models.MotherAccount.name == email)
            .first()
        )

    def list(
        self,
        *,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 20,
    ) -> List[models.MotherAccount]:
        query = self._session.query(models.MotherAccount)
        if search:
            like = f"%{search.lower()}%"
            query = query.filter(func.lower(models.MotherAccount.name).like(like))
        return (
            query.order_by(models.MotherAccount.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count(self, *, search: Optional[str] = None) -> int:
        query = self._session.query(models.MotherAccount)
        if search:
            like = f"%{search.lower()}%"
            query = query.filter(func.lower(models.MotherAccount.name).like(like))
        return query.count()

    def fetch_teams(self, mother_ids: Sequence[int]) -> List[models.MotherTeam]:
        if not mother_ids:
            return []
        return (
            self._session.query(models.MotherTeam)
            .filter(models.MotherTeam.mother_id.in_(mother_ids))
            .order_by(
                models.MotherTeam.mother_id,
                models.MotherTeam.is_default.desc(),
                models.MotherTeam.team_id,
            )
            .all()
        )

    def count_used_seats(self, mother_ids: Sequence[int]) -> dict[int, int]:
        if not mother_ids:
            return {}
        rows = (
            self._session.query(models.SeatAllocation.mother_id, func.count())
            .filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status.in_(
                    [models.SeatStatus.held, models.SeatStatus.used]
                ),
            )
            .group_by(models.SeatAllocation.mother_id)
            .all()
        )
        return {mother_id: count for mother_id, count in rows}

    # ------------------------------------------------------------------
    # Mutations (composition helpers)
    def create_mother(
        self,
        *,
        name: str,
        access_token_enc: str,
        token_expires_at,
        status: models.MotherStatus = models.MotherStatus.active,
        notes: Optional[str] = None,
        group_id: Optional[int] = None,
    ) -> models.MotherAccount:
        mother = models.MotherAccount(
            name=name,
            access_token_enc=access_token_enc,
            token_expires_at=token_expires_at,
            status=status,
            notes=notes,
            group_id=group_id,
        )
        self._session.add(mother)
        self._session.flush()
        return mother

    def replace_teams(self, mother_id: int, teams: Sequence[dict]) -> None:
        self._session.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()
        default_set = False
        for t in teams:
            is_def = bool(t.get("is_default", False)) and not default_set
            if is_def:
                default_set = True
            self._session.add(
                models.MotherTeam(
                    mother_id=mother_id,
                    team_id=t.get("team_id"),
                    team_name=t.get("team_name"),
                    is_enabled=bool(t.get("is_enabled", True)),
                    is_default=is_def,
                )
            )

    def ensure_default_seats(self, mother: models.MotherAccount) -> None:
        seat_limit = mother.seat_limit or 0
        for idx in range(1, seat_limit + 1):
            self._session.add(
                models.SeatAllocation(
                    mother_id=mother.id,
                    slot_index=idx,
                    status=models.SeatStatus.free,
                )
            )

    def get_available_seat(self, mother_id: int) -> Optional[models.SeatAllocation]:
        return (
            self._session.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.mother_id == mother_id,
                models.SeatAllocation.status == models.SeatStatus.free,
            )
            .order_by(models.SeatAllocation.slot_index.asc())
            .first()
        )

    def get_seats_for_email(self, team_id: str, email: str) -> list[models.SeatAllocation]:
        return (
            self._session.query(models.SeatAllocation)
            .filter(
                models.SeatAllocation.team_id == team_id,
                models.SeatAllocation.email == email,
            )
            .all()
        )

    # ---------------------------------------------------------------
    # 新增：支持DTO的查询方法
    def get_mother_summary(self, mother_id: int) -> Optional[MotherSummary]:
        """
        获取Mother账号的完整摘要信息

        Args:
            mother_id: Mother账号ID

        Returns:
            MotherSummary: 完整的摘要信息，不存在时返回None
        """
        mother = self.get(mother_id)
        if not mother:
            return None

        return self.build_mother_summary(mother)

    def build_mother_summary(self, mother: models.MotherAccount) -> MotherSummary:
        """
        基于ORM模型构建MotherSummary DTO

        Args:
            mother: MotherAccount ORM实例

        Returns:
            MotherSummary: 构建的DTO对象
        """
        # 加载关联数据
        teams = (
            self._session.query(models.MotherTeam)
            .filter(models.MotherTeam.mother_id == mother.id)
            .order_by(
                models.MotherTeam.is_default.desc(),
                models.MotherTeam.team_id,
            )
            .all()
        )

        children = (
            self._session.query(models.ChildAccount)
            .filter(models.ChildAccount.mother_id == mother.id)
            .all()
        )

        seats = (
            self._session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.mother_id == mother.id)
            .order_by(models.SeatAllocation.slot_index)
            .all()
        )

        # 构建DTO
        from app.domains.mother import (
            MotherTeamSummary,
            MotherChildSummary,
            MotherSeatSummary,
            MotherStatusDto,
        )

        team_summaries = [
            MotherTeamSummary(
                team_id=team.team_id,
                team_name=team.team_name,
                is_enabled=team.is_enabled,
                is_default=team.is_default,
            )
            for team in teams
        ]

        child_summaries = [
            MotherChildSummary(
                child_id=child.child_id,
                name=child.name,
                email=child.email,
                team_id=child.team_id,
                team_name=child.team_name,
                status=child.status,
                member_id=child.member_id,
                created_at=child.created_at,
            )
            for child in children
        ]

        seat_summaries = [
            MotherSeatSummary(
                slot_index=seat.slot_index,
                team_id=seat.team_id,
                email=seat.email,
                status=seat.status.value,
                held_until=seat.held_until,
                invite_request_id=seat.invite_request_id,
                invite_id=seat.invite_id,
                member_id=seat.member_id,
            )
            for seat in seats
        ]

        # 计算统计信息
        seats_in_use = len([
            s for s in seat_summaries
            if s.status in [models.SeatStatus.held.value, models.SeatStatus.used.value]
        ])

        return MotherSummary(
            id=mother.id,
            name=mother.name,
            status=MotherStatusDto(mother.status.value),
            seat_limit=mother.seat_limit,
            group_id=mother.group_id,
            pool_group_id=mother.pool_group_id,
            token_expires_at=mother.token_expires_at,
            notes=mother.notes,
            created_at=mother.created_at,
            updated_at=mother.updated_at,
            teams=team_summaries,
            children=child_summaries,
            seats=seat_summaries,
            teams_count=len(team_summaries),
            children_count=len(child_summaries),
            seats_in_use=seats_in_use,
            seats_available=mother.seat_limit - seats_in_use,
        )

    def list_mothers_paginated(
        self,
        filters: MotherListFilters,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[List[models.MotherAccount], int]:
        """
        分页查询Mother账号列表

        Args:
            filters: 查询过滤器
            offset: 偏移量
            limit: 限制数量

        Returns:
            tuple: (Mother账号列表, 总数)
        """
        query = self._session.query(models.MotherAccount)

        # 应用过滤器
        if filters.search:
            like = f"%{filters.search.lower()}%"
            query = query.filter(func.lower(models.MotherAccount.name).like(like))

        if filters.status:
            query = query.filter(models.MotherAccount.status == models.MotherStatus(filters.status.value))

        if filters.group_id is not None:
            query = query.filter(models.MotherAccount.group_id == filters.group_id)

        if filters.pool_group_id is not None:
            query = query.filter(models.MotherAccount.pool_group_id == filters.pool_group_id)

        if filters.has_pool_group is not None:
            if filters.has_pool_group:
                query = query.filter(models.MotherAccount.pool_group_id.isnot(None))
            else:
                query = query.filter(models.MotherAccount.pool_group_id.is_(None))

        # 获取总数
        total = query.count()

        # 获取分页数据
        mothers = (
            query.order_by(models.MotherAccount.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return mothers, total

    def get_mother(self, mother_id: int) -> Optional[models.MotherAccount]:
        """获取单个Mother账号（重命名原来的get方法）"""
        return self._session.get(models.MotherAccount, mother_id)
