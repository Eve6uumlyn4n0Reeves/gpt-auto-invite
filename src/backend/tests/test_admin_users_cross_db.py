from __future__ import annotations

from datetime import datetime
from types import MethodType

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import models
from app.main import app
from app.database import BaseUsers, BasePool, get_db
from app.routers.admin import dependencies as admin_deps


def test_admin_users_uses_pool_session_for_team_lookup(test_engine):
    """确保 `/api/admin/users` 通过 Pool 会话读取 MotherTeam。"""

    # 以测试引擎分别构造 users / pool 会话
    UsersSession = sessionmaker(bind=test_engine)
    PoolSession = sessionmaker(bind=test_engine)

    users_session = UsersSession()
    pool_session = PoolSession()

    # 保证表结构存在（内存库在 session 级别保留）
    BaseUsers.metadata.create_all(bind=test_engine)
    BasePool.metadata.create_all(bind=test_engine)

    # 清理既有数据
    users_session.query(models.InviteRequest).delete(synchronize_session=False)
    pool_session.query(models.MotherTeam).delete(synchronize_session=False)
    pool_session.query(models.MotherAccount).delete(synchronize_session=False)
    users_session.commit()
    pool_session.commit()

    # 在 Pool 库插入母号与团队
    mother = models.MotherAccount(
        name="mother@example.com",
        status=models.MotherStatus.active,
        seat_limit=3,
    )
    pool_session.add(mother)
    pool_session.flush()

    team = models.MotherTeam(
        mother_id=mother.id,
        team_id="team-123",
        team_name="Team From Pool",
        is_enabled=True,
        is_default=True,
    )
    pool_session.add(team)
    pool_session.commit()

    # 在 Users 库插入邀请记录
    invite = models.InviteRequest(
        mother_id=mother.id,
        team_id=team.team_id,
        email="user@example.com",
        status=models.InviteStatus.sent,
        created_at=datetime.utcnow(),
    )
    users_session.add(invite)
    users_session.commit()

    # 对 Users 会话设置防护，若误用查询 MotherTeam 将抛错
    original_query = users_session.__class__.query

    def guarded_query(self, *entities, **kwargs):
        if any(entity is models.MotherTeam for entity in entities):
            raise AssertionError("MotherTeam must not be queried via users session")
        return original_query(self, *entities, **kwargs)

    users_session.query = MethodType(guarded_query, users_session)

    # 覆盖依赖，分别提供 users / pool 会话
    def override_get_db():
        try:
            yield users_session
        finally:
            pass

    def override_get_db_pool():
        try:
            yield pool_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[admin_deps.get_db] = override_get_db
    app.dependency_overrides[admin_deps.get_db_pool] = override_get_db_pool

    try:
        with TestClient(app) as client:
            resp = client.get("/api/admin/users")
        assert resp.status_code == 200
        payload = resp.json()
        items = payload.get("items") or []
        assert isinstance(items, list) and len(items) == 1
        assert items[0]["team_name"] == "Team From Pool"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(admin_deps.get_db, None)
        app.dependency_overrides.pop(admin_deps.get_db_pool, None)
        users_session.query = MethodType(original_query, users_session)
        users_session.close()
        pool_session.close()
