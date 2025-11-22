"""
pytest 配置文件
"""
from datetime import datetime
from typing import Generator, List

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app import models
from app.config import settings
from app.database import BaseUsers, BasePool, get_db, SessionLocal
from app.routers.admin import dependencies as admin_deps
from app.security import encrypt_token

# 测试环境强制识别为 test，确保服务逻辑走测试分支
settings.env = "test"


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    # 测试环境：在同一内存库上创建两套表，便于端到端用例
    BaseUsers.metadata.create_all(bind=engine)
    BasePool.metadata.create_all(bind=engine)
    try:
        res = engine.execute("PRAGMA table_info('mother_accounts')").fetchall()
        print('TEST mother_accounts columns:', res)
    except Exception:
        pass
    # 初始化默认管理员配置，避免登录路由空指针
    try:
        from app.security import hash_password
        TestSession = sessionmaker(bind=engine)
        sess = TestSession()
        try:
            if not sess.query(models.AdminConfig).first():
                sess.add(models.AdminConfig(password_hash=hash_password("admin123")))
                sess.commit()
        finally:
            sess.close()
    except Exception:
        pass
    yield engine
    BasePool.metadata.drop_all(bind=engine)
    BaseUsers.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(test_engine) -> Generator[Session, None, None]:
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSessionLocal()
    from app.routers.routers import public
    public.SessionLocal = TestingSessionLocal
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        try:
            # debug: print bound url and columns
            bind = db_session.get_bind()
            try:
                cols = bind.execute("PRAGMA table_info('mother_accounts')").fetchall()
                print('OVERRIDE mother_accounts columns:', cols)
            except Exception:
                pass
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    # 确保 admin 路由使用相同依赖覆盖（users/pool 双库）
    app.dependency_overrides[admin_deps.get_db] = override_get_db
    app.dependency_overrides[admin_deps.get_db_pool] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_redeem_codes(db_session: Session) -> List[models.RedeemCode]:
    codes: List[models.RedeemCode] = []
    db_session.query(models.RedeemCode).delete(synchronize_session=False)
    prefix = __import__("uuid").uuid4().hex
    for i in range(3):
        code = models.RedeemCode(
            code_hash=f"{prefix}_{i}",
            batch_id="batch-test",
            status=models.CodeStatus.unused,
            created_at=datetime.utcnow(),
        )
        db_session.add(code)
        codes.append(code)
    db_session.commit()
    return codes


@pytest.fixture
def sample_mothers(db_session: Session) -> List[models.MotherAccount]:
    mothers: List[models.MotherAccount] = []
    db_session.query(models.SeatAllocation).delete(synchronize_session=False)
    db_session.query(models.InviteRequest).delete(synchronize_session=False)
    db_session.query(models.MotherTeam).delete(synchronize_session=False)
    db_session.query(models.MotherAccount).delete(synchronize_session=False)
    db_session.commit()
    for idx in range(2):
        mother = models.MotherAccount(
            name=f"mother-{idx}@example.com",
            access_token_enc=encrypt_token(f"token-{idx}"),
            status=models.MotherStatus.active,
            seat_limit=3,
        )
        db_session.add(mother)
        db_session.flush()

        team = models.MotherTeam(
            mother_id=mother.id,
            team_id=f"team-{idx}",
            team_name=f"Team {idx}",
            is_enabled=True,
            is_default=True,
        )
        db_session.add(team)

        for slot in range(1, mother.seat_limit + 1):
            db_session.add(
                models.SeatAllocation(
                    mother_id=mother.id,
                    slot_index=slot,
                    status=models.SeatStatus.free,
                )
            )

        mothers.append(mother)

    db_session.commit()
    return mothers


@pytest.fixture
def sample_invites(db_session: Session, sample_mothers, sample_redeem_codes):
    invites: List[models.InviteRequest] = []
    for idx, mother in enumerate(sample_mothers):
        db_session.refresh(mother)
        team_id = mother.teams[0].team_id if mother.teams else None
        seat = (
            db_session.query(models.SeatAllocation)
            .filter(models.SeatAllocation.mother_id == mother.id)
            .order_by(models.SeatAllocation.slot_index.asc())
            .first()
        )
        if seat:
            seat.status = models.SeatStatus.used
            seat.team_id = team_id
            seat.email = f"user{idx}@example.com"
            db_session.add(seat)

        invite = models.InviteRequest(
            mother_id=mother.id,
            team_id=team_id,
            email=f"user{idx}@example.com",
            code_id=sample_redeem_codes[idx % len(sample_redeem_codes)].id,
            status=models.InviteStatus.sent,
            created_at=datetime.utcnow(),
        )
        db_session.add(invite)
        invites.append(invite)
    db_session.commit()
    return invites
