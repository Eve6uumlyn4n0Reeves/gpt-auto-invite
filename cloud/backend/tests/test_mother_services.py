"""
Mother服务层的测试用例。

测试新的DTO、Repository和Service层的功能，确保业务分离的正确性。
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime

from sqlalchemy.orm import Session
from app.domains.mother import (
    MotherCreatePayload,
    MotherUpdatePayload,
    MotherSummary,
    MotherStatusDto,
    MotherListFilters,
)
from app.services.services.mother_command import MotherCommandService
from app.services.services.mother_query import MotherQueryService
from app.repositories.mother_repository import MotherRepository
from app import models


@pytest.fixture
def mock_pool_session():
    """模拟Pool数据库会话"""
    session = Mock(spec=Session)
    session.add = Mock()
    session.flush = Mock()
    session.commit = Mock()
    session.rollback = Mock()
    session.get = Mock()
    session.query = Mock()
    return session


@pytest.fixture
def mock_mother_repository():
    """模拟Mother仓储"""
    return Mock(spec=MotherRepository)


@pytest.fixture
def mock_pool_repository():
    """模拟Pool仓储"""
    return Mock(spec=PoolRepository)


@pytest.fixture
def mother_command_service(mock_pool_session, mock_mother_repository, mock_pool_repository):
    """Mother命令服务实例"""
    return MotherCommandService(mock_pool_session, mock_mother_repository, mock_pool_repository)


@pytest.fixture
def mother_query_service(mock_pool_session, mock_mother_repository, mock_pool_repository):
    """Mother查询服务实例"""
    return MotherQueryService(mock_pool_session, mock_mother_repository, mock_pool_repository)


class TestMotherCommandService:
    """Mother命令服务测试"""

    def test_create_mother_success(self, mother_command_service, mock_pool_session, mock_mother_repository):
        """测试成功创建Mother账号"""
        # 准备测试数据
        payload = MotherCreatePayload(
            name="test-mother",
            access_token_enc="encrypted_token",
            seat_limit=5,
            group_id=None,
            pool_group_id=None,
            notes="测试备注"
        )

        # 模拟创建的Mother对象
        mock_mother = Mock(spec=models.MotherAccount)
        mock_mother.id = 1
        mock_mother.name = "test-mother"
        mock_mother.status = models.MotherStatus.active
        mock_mother.seat_limit = 5
        mock_mother.group_id = None
        mock_mother.pool_group_id = None
        mock_mother.notes = "测试备注"
        mock_mother.created_at = datetime.utcnow()
        mock_mother.updated_at = datetime.utcnow()

        # 模拟仓储返回
        mock_mother_repository.get_mother_summary.return_value = MotherSummary(
            id=1,
            name="test-mother",
            status=MotherStatusDto.active,
            seat_limit=5,
            group_id=None,
            pool_group_id=None,
            notes="测试备注",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            teams=[],
            children=[],
            seats=[],
            teams_count=0,
            children_count=0,
            seats_in_use=0,
            seats_available=5,
        )

        # 模拟PoolGroup查询返回None（当pool_group_id为None时）
        mock_pool_session.get.return_value = None

        # 执行操作
        result = mother_command_service.create_mother(payload)

        # 验证结果
        assert result is not None
        assert result.name == "test-mother"
        assert result.status == MotherStatusDto.active
        assert result.seat_limit == 5

        # 验证交互
        mock_pool_session.add.assert_called()
        mock_pool_session.commit.assert_called()
        mock_mother_repository.get_mother_summary.assert_called_with(1)

    def test_create_mother_invalid_pool_group(self, mother_command_service, mock_pool_session):
        """测试创建Mother账号时号池组不存在"""
        payload = MotherCreatePayload(
            name="test-mother",
            access_token_enc="encrypted_token",
            pool_group_id=999,  # 不存在的号池组ID
        )

        # 模拟号池组不存在
        mock_pool_session.get.return_value = None

        # 执行并验证异常
        with pytest.raises(ValueError, match="PoolGroup 999 不存在"):
            mother_command_service.create_mother(payload)

        # 验证没有提交
        mock_pool_session.commit.assert_not_called()

    def test_update_mother_success(self, mother_command_service, mock_mother_repository):
        """测试成功更新Mother账号"""
        # 准备测试数据
        mother_id = 1
        payload = MotherUpdatePayload(
            name="updated-mother",
            status=MotherStatusDto.disabled,
            notes="更新的备注"
        )

        # 模拟现有的Mother对象
        mock_mother = Mock(spec=models.MotherAccount)
        mock_mother.id = mother_id
        mock_mother.name = "old-mother"
        mock_mother.status = models.MotherStatus.active
        mock_mother.seat_limit = 5
        mock_mother.notes = "旧备注"

        mock_mother_repository.get_mother.return_value = mock_mother

        # 模拟更新后的摘要
        mock_summary = MotherSummary(
            id=mother_id,
            name="updated-mother",
            status=MotherStatusDto.disabled,
            seat_limit=5,
            group_id=None,
            pool_group_id=None,
            notes="更新的备注",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            teams=[],
            children=[],
            seats=[],
            teams_count=0,
            children_count=0,
            seats_in_use=0,
            seats_available=5,
        )
        mock_mother_repository.get_mother_summary.return_value = mock_summary

        # 执行操作
        result = mother_command_service.update_mother(mother_id, payload)

        # 验证结果
        assert result is not None
        assert result.name == "updated-mother"
        assert result.status == MotherStatusDto.disabled
        assert result.notes == "更新的备注"

        # 验证字段更新
        assert mock_mother.name == "updated-mother"
        assert mock_mother.status == models.MotherStatus.disabled
        assert mock_mother.notes == "更新的备注"

    def test_update_mother_not_found(self, mother_command_service, mock_mother_repository):
        """测试更新不存在的Mother账号"""
        mother_id = 999
        payload = MotherUpdatePayload(name="updated-mother")

        mock_mother_repository.get_mother.return_value = None

        # 执行并验证异常
        with pytest.raises(ValueError, match="Mother账号 999 不存在"):
            mother_command_service.update_mother(mother_id, payload)

    def test_delete_mother_success(self, mother_command_service, mock_mother_repository, mock_pool_session):
        """测试成功删除Mother账号"""
        mother_id = 1

        # 模拟现有的Mother对象
        mock_mother = Mock(spec=models.MotherAccount)
        mock_mother.id = mother_id
        mock_mother_repository.get_mother.return_value = mock_mother

        # 模拟没有已使用席位和子号
        mock_pool_session.query.return_value.filter.return_value.count.return_value = 0

        # 执行操作
        result = mother_command_service.delete_mother(mother_id)

        # 验证结果
        assert result is True
        mock_pool_session.delete.assert_called_with(mock_mother)
        mock_pool_session.commit.assert_called()

    def test_delete_mother_with_used_seats(self, mother_command_service, mock_pool_session):
        """测试删除有已使用席位的Mother账号"""
        mother_id = 1

        # 模拟现有的Mother对象
        mock_mother = Mock(spec=models.MotherAccount)
        mock_mother.id = mother_id

        mock_mother_repository = Mock(spec=MotherRepository)
        mock_mother_repository.get_mother.return_value = mock_mother

        service = MotherCommandService(mock_pool_session, mock_mother_repository)

        # 模拟有已使用席位
        mock_pool_session.query.return_value.filter.return_value.count.return_value = 2

        # 模拟有子号
        mock_pool_session.query.return_value.filter.return_value.count.return_value = 1

        # 执行并验证异常
        with pytest.raises(ValueError, match="无法删除Mother账号：存在已使用的席位"):
            service.delete_mother(mother_id)

        # 验证没有删除
        mock_pool_session.delete.assert_not_called()


class TestMotherQueryService:
    """Mother查询服务测试"""

    def test_get_mother_success(self, mother_query_service, mock_mother_repository):
        """测试成功获取Mother账号"""
        mother_id = 1
        expected_summary = MotherSummary(
            id=mother_id,
            name="test-mother",
            status=MotherStatusDto.active,
            seat_limit=5,
            group_id=None,
            pool_group_id=None,
            notes=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            teams=[],
            children=[],
            seats=[],
            teams_count=0,
            children_count=0,
            seats_in_use=0,
            seats_available=5,
        )

        mock_mother_repository.get_mother_summary.return_value = expected_summary

        # 执行操作
        result = mother_query_service.get_mother(mother_id)

        # 验证结果
        assert result is not None
        assert result.id == mother_id
        assert result.name == "test-mother"
        mock_mother_repository.get_mother_summary.assert_called_once_with(mother_id)

    def test_get_mother_not_found(self, mother_query_service, mock_mother_repository):
        """测试获取不存在的Mother账号"""
        mother_id = 999
        mock_mother_repository.get_mother_summary.return_value = None

        # 执行操作
        result = mother_query_service.get_mother(mother_id)

        # 验证结果
        assert result is None

    def test_list_mothers_with_filters(self, mother_query_service, mock_mother_repository):
        """测试使用过滤器列表查询Mother账号"""
        filters = MotherListFilters(
            search="test",
            status=MotherStatusDto.active,
            pool_group_id=1,
            has_pool_group=True
        )

        # 模拟分页查询结果
        mock_mothers = [Mock(spec=models.MotherAccount)]
        total = 1

        mock_mother_repository.list_mothers_paginated.return_value = (mock_mothers, total)

        # 模拟摘要构建
        mock_summaries = [MotherSummary(
            id=1,
            name="test-mother",
            status=MotherStatusDto.active,
            seat_limit=5,
            group_id=None,
            pool_group_id=1,
            notes=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            teams=[],
            children=[],
            seats=[],
            teams_count=0,
            children_count=0,
            seats_in_use=0,
            seats_available=5,
        )]
        mock_mother_repository.build_mother_summary.return_value = mock_summaries[0]

        # 执行操作
        result = mother_query_service.list_mothers(filters, page=1, page_size=20)

        # 验证结果
        assert result is not None
        assert len(result.items) == 1
        assert result.total == 1
        assert result.page == 1
        assert result.page_size == 20

        # 验证调用参数
        mock_mother_repository.list_mothers_paginated.assert_called_once_with(
            filters=filters,
            offset=0,
            limit=20
        )

    def test_get_quota_metrics(self, mother_query_service, mock_pool_session):
        """测试获取配额统计信息"""
        # 模拟统计查询结果
        mock_pool_session.query.return_value.filter.return_value.scalar.side_effect = [
            10,  # total_mothers
            8,   # active_mothers
            2,   # invalid_mothers
            70,  # total_seats
            30,  # used_seats
            5,   # total_pool_groups
            3,   # active_pool_groups
            25,  # total_children
            20,  # active_children
        ]

        # 执行操作
        result = mother_query_service.get_quota_metrics()

        # 验证结果结构
        assert "mothers" in result
        assert "seats" in result
        assert "pool_groups" in result
        assert "children" in result

        # 验证具体数值
        assert result["mothers"]["total"] == 10
        assert result["mothers"]["active"] == 8
        assert result["seats"]["total"] == 70
        assert result["seats"]["used"] == 30
        assert result["seats"]["available"] == 40
        assert result["seats"]["utilization_rate"] == 42.86  # 30/70 * 100


class TestMotherDTOs:
    """Mother DTO测试"""

    def test_mother_create_payload_validation(self):
        """测试MotherCreatePayload验证"""
        # 正常情况
        payload = MotherCreatePayload(
            name="test-mother",
            access_token_enc="encrypted_token",
            seat_limit=5
        )
        assert payload.name == "test-mother"
        assert payload.seat_limit == 5

        # 边界情况
        payload = MotherCreatePayload(
            name="test",
            access_token_enc="token",
            seat_limit=1,  # 最小值
            group_id=None,
            pool_group_id=None,
            notes=None
        )
        assert payload.seat_limit == 1

    def test_mother_update_payload_partial(self):
        """测试MotherUpdatePayload部分更新"""
        # 只更新部分字段
        payload = MotherUpdatePayload(
            name="updated-name",
            status=None,
            seat_limit=None
        )
        assert payload.name == "updated-name"
        assert payload.status is None
        assert payload.seat_limit is None

    def test_mother_list_filters(self):
        """测试MotherListFilters过滤器"""
        # 综合过滤器
        filters = MotherListFilters(
            search="keyword",
            status=MotherStatusDto.active,
            group_id=1,
            pool_group_id=2,
            has_pool_group=True
        )
        assert filters.search == "keyword"
        assert filters.status == MotherStatusDto.active
        assert filters.has_pool_group is True

        # 空过滤器
        empty_filters = MotherListFilters()
        assert empty_filters.search is None
        assert empty_filters.status is None


if __name__ == "__main__":
    pytest.main([__file__])