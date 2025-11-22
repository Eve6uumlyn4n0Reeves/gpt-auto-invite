"""
验证 mother_groups 路由使用 Pool 库会话。

场景：
- 在独立的 Pool/Users 内存库中，仅向 Pool 库插入 MotherGroup；
- 调用 GET /api/admin/mother-groups 应能读到该记录；
- 若误用 Users 会话将导致查询失败或返回空。
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import BasePool, BaseUsers, get_db_pool as raw_get_db_pool, get_db as raw_get_db
from app.routers.admin import dependencies as admin_deps
from app import models
from app.config import settings


def test_mother_groups_use_pool_db_for_list():
    # 测试环境标记
    settings.env = "test"
    # 分别创建独立的内存库
    engine_pool = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    engine_users = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Pool 只创建 Pool 表；Users 只创建 Users 表
    BasePool.metadata.create_all(bind=engine_pool)
    BaseUsers.metadata.create_all(bind=engine_users)

    SessionPool = sessionmaker(bind=engine_pool, autocommit=False, autoflush=False)
    SessionUsers = sessionmaker(bind=engine_users, autocommit=False, autoflush=False)

    def override_get_db_pool():
        sess = SessionPool()
        try:
            yield sess
        finally:
            sess.close()

    def override_get_db_users():
        sess = SessionUsers()
        try:
            yield sess
        finally:
            sess.close()

    # 注入依赖覆盖
    app.dependency_overrides[admin_deps.get_db_pool] = override_get_db_pool
    app.dependency_overrides[admin_deps.get_db] = override_get_db_users
    # 兼容：若路由直接引用了 app.database 的依赖，则一并覆盖
    app.dependency_overrides[raw_get_db_pool] = override_get_db_pool
    app.dependency_overrides[raw_get_db] = override_get_db_users

    # 向 Pool 库插入一条 MotherGroup
    with SessionPool() as s:
        g = models.MotherGroup(name="tg-001", description="test-group", is_active=True)
        s.add(g)
        s.commit()

    with TestClient(app) as client:
        resp = client.get("/api/admin/mother-groups")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # 应至少包含刚插入的组
        names = [row.get("name") for row in data]
        assert "tg-001" in names

    # 清理依赖覆盖
    for key in (admin_deps.get_db_pool, admin_deps.get_db, raw_get_db_pool, raw_get_db):
        app.dependency_overrides.pop(key, None)
