"""
ChildAccount的查询服务。

负责ChildAccount的查询、统计等读操作，仅操作Pool数据库。
返回DTO对象，避免直接暴露ORM模型。
"""

from __future__ import annotations

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from app.repositories.mother_repository import MotherRepository
from app.repositories.pool_repository import PoolRepository
from app.domains.child_account import (
    ChildAccountSummary,
    ChildAccountListFilters,
    ChildAccountListResult,
    ChildAccountStatus,
)
from app import models
from app.models import MotherStatus


class ChildAccountQueryService:
    """ChildAccount的查询服务，负责所有读操作"""

    def __init__(
        self,
        pool_session: Session,
        mother_repository: Optional[MotherRepository] = None,
        pool_repository: Optional[PoolRepository] = None,
    ):
        self._session = pool_session
        self._mother_repo = mother_repository or MotherRepository(pool_session)
        self._pool_repo = pool_repository or PoolRepository(pool_session)

    def get_child_account(self, child_id: int) -> Optional[ChildAccountSummary]:
        """
        获取单个ChildAccount的详细信息

        Args:
            child_id: ChildAccount ID

        Returns:
            ChildAccountSummary: ChildAccount摘要信息，不存在时返回None
        """
        child_account = self._session.get(models.ChildAccount, child_id)
        if not child_account:
            return None

        return self._build_child_summary(child_account)

    def list_child_accounts(
        self,
        filters: ChildAccountListFilters,
        page: int = 1,
        page_size: int = 20,
    ) -> ChildAccountListResult:
        """
        分页查询ChildAccount列表

        Args:
            filters: 查询过滤器
            page: 页码，从1开始
            page_size: 每页大小

        Returns:
            ChildAccountListResult: 分页查询结果
        """
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20

        query = self._session.query(models.ChildAccount)

        # 应用过滤器
        if filters.search:
            like = f"%{filters.search.lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.ChildAccount.name).like(like),
                    func.lower(models.ChildAccount.email).like(like),
                    func.lower(models.ChildAccount.child_id).like(like),
                )
            )

        if filters.status:
            query = query.filter(models.ChildAccount.status == filters.status.value)

        if filters.mother_id is not None:
            query = query.filter(models.ChildAccount.mother_id == filters.mother_id)

        if filters.team_id is not None:
            query = query.filter(models.ChildAccount.team_id == filters.team_id)

        if filters.has_member_id is not None:
            if filters.has_member_id:
                query = query.filter(models.ChildAccount.member_id.isnot(None))
            else:
                query = query.filter(models.ChildAccount.member_id.is_(None))

        # 获取总数
        total = query.count()

        # 获取分页数据
        child_accounts = (
            query.order_by(models.ChildAccount.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        items = [self._build_child_summary(child) for child in child_accounts]

        return ChildAccountListResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_next=page * page_size < total,
            has_prev=page > 1,
        )

    def get_child_accounts_by_mother(self, mother_id: int) -> List[ChildAccountSummary]:
        """
        获取指定Mother账号下的所有ChildAccount

        Args:
            mother_id: Mother账号ID

        Returns:
            List[ChildAccountSummary]: ChildAccount列表
        """
        child_accounts = (
            self._session.query(models.ChildAccount)
            .filter(models.ChildAccount.mother_id == mother_id)
            .order_by(models.ChildAccount.created_at.desc())
            .all()
        )

        return [self._build_child_summary(child) for child in child_accounts]

    def get_child_accounts_by_team(self, mother_id: int, team_id: str) -> List[ChildAccountSummary]:
        """
        获取指定团队的ChildAccount列表

        Args:
            mother_id: Mother账号ID
            team_id: 团队ID

        Returns:
            List[ChildAccountSummary]: ChildAccount列表
        """
        child_accounts = (
            self._session.query(models.ChildAccount)
            .filter(
                models.ChildAccount.mother_id == mother_id,
                models.ChildAccount.team_id == team_id
            )
            .order_by(models.ChildAccount.created_at.desc())
            .all()
        )

        return [self._build_child_summary(child) for child in child_accounts]

    def search_child_accounts(self, query: str, limit: int = 10) -> List[ChildAccountSummary]:
        """
        搜索ChildAccount（简单搜索）

        Args:
            query: 搜索关键词
            limit: 结果数量限制

        Returns:
            List[ChildAccountSummary]: 匹配的ChildAccount列表
        """
        filters = ChildAccountListFilters(search=query)
        result = self.list_child_accounts(filters, page=1, page_size=limit)
        return result.items

    def get_child_account_statistics(self) -> dict:
        """
        获取ChildAccount统计信息

        Returns:
            dict: 包含各种统计指标的字典
        """
        # 基础统计
        total_children = self._session.query(func.count(models.ChildAccount.id)).scalar()

        active_children = self._session.query(func.count(models.ChildAccount.id)).filter(
            models.ChildAccount.status == 'active'
        ).scalar()

        inactive_children = self._session.query(func.count(models.ChildAccount.id)).filter(
            models.ChildAccount.status == 'inactive'
        ).scalar()

        suspended_children = self._session.query(func.count(models.ChildAccount.id)).filter(
            models.ChildAccount.status == 'suspended'
        ).scalar()

        # 按Mother账号统计
        children_by_mother = (
            self._session.query(
                models.ChildAccount.mother_id,
                func.count(models.ChildAccount.id).label('count')
            )
            .group_by(models.ChildAccount.mother_id)
            .all()
        )

        # 按团队统计
        children_by_team = (
            self._session.query(
                models.ChildAccount.mother_id,
                models.ChildAccount.team_id,
                func.count(models.ChildAccount.id).label('count')
            )
            .group_by(models.ChildAccount.mother_id, models.ChildAccount.team_id)
            .all()
        )

        # 有member_id的子号统计
        with_member_id = self._session.query(func.count(models.ChildAccount.id)).filter(
            models.ChildAccount.member_id.isnot(None)
        ).scalar()

        return {
            'total': total_children,
            'active': active_children,
            'inactive': inactive_children,
            'suspended': suspended_children,
            'with_member_id': with_member_id,
            'without_member_id': total_children - with_member_id,
            'by_mother': [
                {'mother_id': mother_id, 'count': count}
                for mother_id, count in children_by_mother
            ],
            'by_team': [
                {'mother_id': mother_id, 'team_id': team_id, 'count': count}
                for mother_id, team_id, count in children_by_team
            ],
        }

    def get_orphaned_child_accounts(self) -> List[ChildAccountSummary]:
        """
        获取孤立的ChildAccount（Mother账号不存在或已禁用）

        Returns:
            List[ChildAccountSummary]: 孤立的ChildAccount列表
        """
        # 找出Mother账号不存在或已禁用的ChildAccount
        orphaned_children = (
            self._session.query(models.ChildAccount)
            .outerjoin(models.MotherAccount, models.ChildAccount.mother_id == models.MotherAccount.id)
            .filter(
                or_(
                    models.MotherAccount.id.is_(None),
                    models.MotherAccount.status == models.MotherStatus.disabled
                )
            )
            .all()
        )

        return [self._build_child_summary(child) for child in orphaned_children]

    def get_child_accounts_without_member_id(self) -> List[ChildAccountSummary]:
        """
        获取没有member_id的ChildAccount

        Returns:
            List[ChildAccountSummary]: 没有member_id的ChildAccount列表
        """
        child_accounts = (
            self._session.query(models.ChildAccount)
            .filter(models.ChildAccount.member_id.is_(None))
            .order_by(models.ChildAccount.created_at.desc())
            .all()
        )

        return [self._build_child_summary(child) for child in child_accounts]

    def get_child_account_status_distribution(self) -> dict:
        """
        获取ChildAccount状态分布

        Returns:
            dict: 状态分布统计
        """
        status_counts = (
            self._session.query(
                models.ChildAccount.status,
                func.count(models.ChildAccount.id).label('count'),
            )
            .group_by(models.ChildAccount.status)
            .all()
        )

        distribution = {status.value: 0 for status in ChildAccountStatus}
        for status, count in status_counts:
            distribution[status] = count

        return distribution

    def _build_child_summary(self, child_account: models.ChildAccount) -> ChildAccountSummary:
        """
        基于ORM模型构建ChildAccountSummary DTO

        Args:
            child_account: ChildAccount ORM实例

        Returns:
            ChildAccountSummary: 构建的DTO对象
        """
        mother = self._mother_repo.get(child_account.mother_id)

        return ChildAccountSummary(
            id=child_account.id,
            child_id=child_account.child_id,
            name=child_account.name,
            email=child_account.email,
            mother_id=child_account.mother_id,
            team_id=child_account.team_id,
            team_name=child_account.team_name,
            status=ChildAccountStatus(child_account.status),
            member_id=child_account.member_id,
            created_at=child_account.created_at,
            updated_at=child_account.updated_at,
            mother_name=mother.name if mother else None,
            mother_status=mother.status.value if mother else None,
        )