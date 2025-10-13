"""
pytest 配置文件
提供测试夹具和全局配置
"""
import asyncio
import pytest
import tempfile
from typing import Generator, AsyncGenerator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from datetime import datetime

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app import models


# 测试数据库配置
@pytest.fixture(scope="session")
def test_db_url() -> str:
    """使用内存SQLite数据库进行测试"""
    return "sqlite:///:memory:"


@pytest.fixture(scope="session")
def test_engine(test_db_url: str):
    """创建测试数据库引擎"""
    engine = create_engine(
        test_db_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )

    # 创建所有表
    Base.metadata.create_all(bind=engine)

    yield engine

    # 清理
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(test_engine) -> Generator[Session, None, None]:
    """创建测试数据库会话"""
    TestSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_client(db_session) -> Generator[TestClient, None, None]:
    """创建测试客户端"""
    # 覆盖数据库依赖
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client

    # 清理依赖覆盖
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session: Session):
    """创建管理员用户"""
    from app.security import hash_password

    admin = models.AdminUser(
        username="admin",
        password_hash=hash_password("admin123"),
        is_active=True,
        created_at=datetime.utcnow()
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    return admin


@pytest.fixture
def admin_headers(test_client: TestClient, admin_user):
    """管理员认证头部"""
    response = test_client.post(
        "/api/admin/login",
        data={"username": "admin", "password": "admin123"}
    )
    assert response.status_code == 200

    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_redeem_codes(db_session: Session):
    """创建示例兑换码"""
    codes = []
    for i in range(5):
        code = models.RedeemCode(
            code_hash=f"hash_{i}",
            batch_id="test_batch_001",
            status=models.CodeStatus.unused,
            created_at=datetime.utcnow()
        )
        db_session.add(code)
        codes.append(code)

    db_session.commit()
    for code in codes:
        db_session.refresh(code)

    return codes


@pytest.fixture
def sample_mother_accounts(db_session: Session):
    """创建示例母账号"""
    mothers = []
    for i in range(3):
        mother = models.MotherAccount(
            account_id=f"mother_{i}",
            email=f"mother{i}@example.com",
            name=f"Mother {i}",
            seat_limit=10,
            created_at=datetime.utcnow()
        )
        db_session.add(mother)
        mothers.append(mother)

    db_session.commit()
    for mother in mothers:
        db_session.refresh(mother)

    return mothers


@pytest.fixture
def sample_teams(db_session: Session, sample_mother_accounts):
    """创建示例团队"""
    teams = []
    for i, mother in enumerate(sample_mother_accounts):
        team = models.MotherTeam(
            team_id=f"team_{i}",
            name=f"Team {i}",
            mother_id=mother.id,
            created_at=datetime.utcnow()
        )
        db_session.add(team)
        teams.append(team)

    db_session.commit()
    for team in teams:
        db_session.refresh(team)

    return teams


@pytest.fixture
def sample_invite_requests(db_session: Session, sample_redeem_codes, sample_mother_accounts, sample_teams):
    """创建示例邀请请求"""
    invites = []
    for i in range(3):
        invite = models.InviteRequest(
            email=f"user{i}@example.com",
            status=models.InviteStatus.pending,
            code_id=sample_redeem_codes[i].id if i < len(sample_redeem_codes) else None,
            mother_id=sample_mother_accounts[i % len(sample_mother_accounts)].id,
            team_id=sample_teams[i % len(sample_teams)].team_id,
            created_at=datetime.utcnow()
        )
        db_session.add(invite)
        invites.append(invite)

    db_session.commit()
    for invite in invites:
        db_session.refresh(invite)

    return invites


@pytest.fixture
def mock_email_service(monkeypatch):
    """模拟邮件服务"""
    class MockEmailService:
        def __init__(self):
            self.sent_emails = []

        def send_invite_email(self, to_email: str, invite_code: str):
            self.sent_emails.append({
                "to": to_email,
                "code": invite_code,
                "sent_at": datetime.utcnow()
            })

    mock_service = MockEmailService()
    monkeypatch.setattr("app.services.services.invites.email_service", mock_service)
    return mock_service


# 异步测试支持
@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环用于异步测试"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# 性能测试标记
def pytest_configure(config):
    """配置pytest标记"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "e2e: marks tests as end-to-end tests"
    )