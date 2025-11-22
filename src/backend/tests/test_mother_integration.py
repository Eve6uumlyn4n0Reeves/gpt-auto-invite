"""
Mother服务层的集成测试。

测试整个服务栈：路由 -> 服务 -> 仓储 -> 数据库的集成功能。
使用内存SQLite数据库进行测试。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from datetime import datetime

from app.main import app
from app.database import BasePool, BaseUsers, get_db_pool, get_db_users
from app import models
from app.security import encrypt_token
from app.services.services.mother_command import MotherCommandService
from app.services.services.mother_query import MotherQueryService
from app.repositories.mother_repository import MotherRepository


# 测试数据库配置
SQLITE_DATABASE_URL = "sqlite:///:memory:"
engine_pool = create_engine(
    SQLITE_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
engine_users = create_engine(
    SQLITE_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionPool = sessionmaker(autocommit=False, autoflush=False, bind=engine_pool)
TestingSessionUsers = sessionmaker(autocommit=False, autoflush=False, bind=engine_users)
# Ensure tables are created once for in-memory engines
BasePool.metadata.create_all(bind=engine_pool)
BaseUsers.metadata.create_all(bind=engine_users)


def override_get_db_pool():
    """覆盖Pool数据库依赖"""
    session = TestingSessionPool()
    try:
        yield session
    finally:
        session.close()


def override_get_db_users():
    """覆盖Users数据库依赖"""
    session = TestingSessionUsers()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db_pool] = override_get_db_pool
app.dependency_overrides[get_db_users] = override_get_db_users


@pytest.fixture(scope="module")
def client():
    """测试客户端"""
    # 创建测试数据库表
    BasePool.metadata.create_all(bind=engine_pool)
    BaseUsers.metadata.create_all(bind=engine_users)

    with TestClient(app) as c:
        yield c

    # 清理测试数据库表
    BasePool.metadata.drop_all(bind=engine_pool)
    BaseUsers.metadata.drop_all(bind=engine_users)


@pytest.fixture
def pool_session():
    """Pool数据库会话"""
    session = TestingSessionPool()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def users_session():
    """Users数据库会话"""
    session = TestingSessionUsers()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def sample_pool_group(pool_session):
    """示例号池组（幂等）"""
    existing = pool_session.query(models.PoolGroup).filter_by(name="test-pool-group").first()
    if existing:
        return existing
    pool_group = models.PoolGroup(
        name="test-pool-group",
        description="测试号池组",
        is_active=True
    )
    pool_session.add(pool_group)
    pool_session.commit()
    return pool_group


@pytest.fixture
def sample_mother_group(pool_session):
    """示例Mother组（幂等）"""
    existing = pool_session.query(models.MotherGroup).filter_by(name="test-group").first()
    if existing:
        return existing
    group = models.MotherGroup(
        name="test-group",
        description="测试组",
        is_active=True
    )
    pool_session.add(group)
    pool_session.commit()
    return group


@pytest.fixture
def mother_command_service(pool_session):
    """Mother命令服务"""
    mother_repo = MotherRepository(pool_session)
    return MotherCommandService(pool_session, mother_repo)


@pytest.fixture
def mother_query_service(pool_session):
    """Mother查询服务"""
    mother_repo = MotherRepository(pool_session)
    return MotherQueryService(pool_session, mother_repo)


class TestMotherServicesIntegration:
    """Mother服务集成测试"""

    def test_create_and_query_mother_complete_flow(
        self,
        mother_command_service,
        mother_query_service,
        sample_pool_group,
        sample_mother_group
    ):
        """测试创建和查询Mother账号的完整流程"""

        # 1. 创建Mother账号
        from app.domains.mother import MotherCreatePayload, MotherStatusDto

        create_payload = MotherCreatePayload(
            name="integration-test-mother",
            access_token_enc=encrypt_token("test_access_token"),
            seat_limit=3,
            group_id=sample_mother_group.id,
            pool_group_id=sample_pool_group.id,
            notes="集成测试Mother账号"
        )

        created_mother = mother_command_service.create_mother(create_payload)

        # 验证创建结果
        assert created_mother is not None
        assert created_mother.name == "integration-test-mother"
        assert created_mother.status == MotherStatusDto.active
        assert created_mother.seat_limit == 3
        assert created_mother.group_id == sample_mother_group.id
        assert created_mother.pool_group_id == sample_pool_group.id
        assert created_mother.notes == "集成测试Mother账号"
        assert created_mother.teams_count == 0
        assert created_mother.children_count == 0
        assert created_mother.seats_in_use == 0
        assert created_mother.seats_available == 3

        # 2. 查询创建的Mother账号
        queried_mother = mother_query_service.get_mother(created_mother.id)

        # 验证查询结果
        assert queried_mother is not None
        assert queried_mother.id == created_mother.id
        assert queried_mother.name == created_mother.name
        assert queried_mother.status == created_mother.status
        assert queried_mother.seat_limit == created_mother.seat_limit

        # 3. 验证席位已正确创建
        assert len(queried_mother.seats) == 3
        for i, seat in enumerate(queried_mother.seats, 1):
            assert seat.slot_index == i
            assert seat.status == "free"  # models.SeatStatus.free.value

    def test_update_mother_status_flow(
        self,
        mother_command_service,
        mother_query_service,
        sample_pool_group
    ):
        """测试更新Mother账号状态的流程"""

        # 1. 创建Mother账号
        from app.domains.mother import MotherCreatePayload, MotherUpdatePayload, MotherStatusDto

        create_payload = MotherCreatePayload(
            name="status-test-mother",
            access_token_enc=encrypt_token("test_token"),
            seat_limit=2,
            pool_group_id=sample_pool_group.id
        )

        created_mother = mother_command_service.create_mother(create_payload)
        assert created_mother.status == MotherStatusDto.active

        # 2. 禁用Mother账号
        update_payload = MotherUpdatePayload(status=MotherStatusDto.disabled)
        updated_mother = mother_command_service.update_mother(created_mother.id, update_payload)

        assert updated_mother.status == MotherStatusDto.disabled

        # 3. 查询验证状态已更新
        queried_mother = mother_query_service.get_mother(created_mother.id)
        assert queried_mother.status == MotherStatusDto.disabled

        # 4. 重新启用
        enabled_mother = mother_command_service.enable_mother(created_mother.id)
        assert enabled_mother.status == MotherStatusDto.active

    def test_list_mothers_with_filters(
        self,
        mother_command_service,
        mother_query_service,
        sample_pool_group
    ):
        """测试列表查询和过滤器功能"""

        from app.domains.mother import MotherCreatePayload, MotherListFilters, MotherStatusDto

        # 创建多个不同状态的Mother账号
        mothers_data = [
            {"name": "active-mother-1", "pool_group_id": sample_pool_group.id},
            {"name": "active-mother-2", "pool_group_id": sample_pool_group.id},
            {"name": "disabled-mother", "pool_group_id": None},
        ]

        created_ids = []

        for data in mothers_data:
            payload = MotherCreatePayload(
                name=data["name"],
                access_token_enc=encrypt_token(f"token_{data['name']}"),
                pool_group_id=data["pool_group_id"]
            )
            mother = mother_command_service.create_mother(payload)
            created_ids.append(mother.id)

        # 禁用一个Mother账号
        mother_command_service.disable_mother(created_ids[2])

        # 测试不同的过滤器

        # 1. 无过滤器，应该返回所有Mother账号
        all_filters = MotherListFilters()
        all_result = mother_query_service.list_mothers(all_filters, page=1, page_size=10)
        assert len(all_result.items) >= 3
        assert all_result.total >= 3

        # 2. 按号池组过滤
        pool_group_filters = MotherListFilters(pool_group_id=sample_pool_group.id)
        pool_result = mother_query_service.list_mothers(pool_group_filters, page=1, page_size=10)
        assert len(pool_result.items) >= 2
        for item in pool_result.items:
            assert item.pool_group_id == sample_pool_group.id

        # 3. 按状态过滤
        active_filters = MotherListFilters(status=MotherStatusDto.active)
        active_result = mother_query_service.list_mothers(active_filters, page=1, page_size=10)
        assert len(active_result.items) >= 2
        for item in active_result.items:
            assert item.status == MotherStatusDto.active

        # 4. 搜索过滤
        search_filters = MotherListFilters(search="active-mother")
        search_result = mother_query_service.list_mothers(search_filters, page=1, page_size=10)
        assert len(search_result.items) >= 2
        for item in search_result.items:
            assert "active-mother" in item.name

        # 5. 号池组分配过滤
        has_pool_group_filters = MotherListFilters(has_pool_group=True)
        has_pool_result = mother_query_service.list_mothers(has_pool_group_filters, page=1, page_size=10)
        assert len(has_pool_result.items) >= 2
        for item in has_pool_result.items:
            assert item.pool_group_id is not None

    def test_quota_metrics_calculation(
        self,
        mother_command_service,
        mother_query_service,
        sample_pool_group
    ):
        """测试配额统计计算"""

        from app.domains.mother import MotherCreatePayload

        # 创建多个Mother账号
        for i in range(3):
            payload = MotherCreatePayload(
                name=f"metrics-mother-{i+1}",
                access_token_enc=encrypt_token(f"token_{i+1}"),
                seat_limit=5,
                pool_group_id=sample_pool_group.id
            )
            mother_command_service.create_mother(payload)

        # 获取统计信息
        metrics = mother_query_service.get_quota_metrics()

        # 验证统计结构
        assert "mothers" in metrics
        assert "seats" in metrics
        assert "pool_groups" in metrics
        assert "children" in metrics

        # 验证Mother账号统计
        assert metrics["mothers"]["total"] >= 3
        assert metrics["mothers"]["active"] >= 3

        # 验证席位统计
        assert metrics["seats"]["total"] >= 15  # 3个Mother * 5个席位
        assert metrics["seats"]["used"] == 0   # 初始状态没有使用席位
        assert metrics["seats"]["available"] >= 15
        assert metrics["seats"]["utilization_rate"] == 0.0

    def test_error_handling_and_validation(
        self,
        mother_command_service,
        mother_query_service,
        pool_session
    ):
        """测试错误处理和数据验证"""

        from app.domains.mother import MotherCreatePayload, MotherUpdatePayload

        # 1. 测试创建不存在的号池组
        with pytest.raises(ValueError, match="PoolGroup 999 不存在"):
            payload = MotherCreatePayload(
                name="test-mother",
                access_token_enc=encrypt_token("test_token"),
                pool_group_id=999  # 不存在的号池组
            )
            mother_command_service.create_mother(payload)

        # 2. 测试更新不存在的Mother账号
        with pytest.raises(ValueError, match="Mother账号 999 不存在"):
            update_payload = MotherUpdatePayload(name="updated-name")
            mother_command_service.update_mother(999, update_payload)

        # 3. 测试查询不存在的Mother账号
        result = mother_query_service.get_mother(999)
        assert result is None

        # 4. 测试删除有使用席位的Mother账号（模拟场景）
        # 首先创建一个Mother账号
        payload = MotherCreatePayload(
            name="delete-test-mother",
            access_token_enc=encrypt_token("test_token"),
            seat_limit=2
        )
        created_mother = mother_command_service.create_mother(payload)

        # 手动模拟一个已使用的席位（实际场景中应该通过邀请流程）
        used_seat = pool_session.query(models.SeatAllocation).filter(
            models.SeatAllocation.mother_id == created_mother.id,
            models.SeatAllocation.slot_index == 1
        ).first()

        if used_seat:
            used_seat.status = models.SeatStatus.used
            pool_session.commit()

            # 现在删除应该失败
            with pytest.raises(ValueError, match="无法删除Mother账号：存在已使用的席位"):
                mother_command_service.delete_mother(created_mother.id)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
