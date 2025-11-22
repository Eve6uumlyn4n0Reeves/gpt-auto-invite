from sqlalchemy import create_engine
from typing import Generator
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from app.config import settings
from app.domain_context import ServiceDomain, ensure_domain_allows

# --- 双引擎：用户组库 / 号池库 ---
is_sqlite_users = settings.database_url_users.startswith("sqlite")
is_sqlite_pool = settings.database_url_pool.startswith("sqlite")

engine_users = create_engine(
    settings.database_url_users,
    connect_args={"check_same_thread": False} if is_sqlite_users else {},
    pool_pre_ping=True,
    **({
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
        "pool_recycle": settings.db_pool_recycle,
    } if not is_sqlite_users else {})
)

engine_pool = create_engine(
    settings.database_url_pool,
    connect_args={"check_same_thread": False} if is_sqlite_pool else {},
    pool_pre_ping=True,
    **({
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
        "pool_recycle": settings.db_pool_recycle,
    } if not is_sqlite_pool else {})
)

SessionUsers = sessionmaker(bind=engine_users, autocommit=False, autoflush=False)
SessionPool = sessionmaker(bind=engine_pool, autocommit=False, autoflush=False)

# --- 双 Base：用户库 / 号池库 ---
BaseUsers = declarative_base()
BasePool = declarative_base()

from app import models as _models  # noqa: F401 ensure model metadata registered

# 兼容：旧代码仍引用 SessionLocal → 用户组库
SessionLocal = SessionUsers
try:
    # 兼容旧引用：Base（仅用于测试脚本/遗留场景，不作为迁移 target_metadata）
    Base = BaseUsers  # type: ignore
except Exception:
    pass

def init_db():
    from app import models  # noqa: F401 ensure model metadata registered
    # 仅在开发/测试环境且数据库为空时使用 create_all，生产必须使用 Alembic 迁移
    try:
        from app.config import settings as _settings
        if _settings.env in ("dev", "development", "test", "testing"):
            # 分别对 users / pool 引擎进行探测与按各自 Base 创建
            with engine_users.connect() as conn_u:
                insp_u = __import__('sqlalchemy').inspect(conn_u)
                if not insp_u.get_table_names():
                    BaseUsers.metadata.create_all(bind=engine_users)
            with engine_pool.connect() as conn_p:
                insp_p = __import__('sqlalchemy').inspect(conn_p)
                if not insp_p.get_table_names():
                    BasePool.metadata.create_all(bind=engine_pool)
    except Exception as e:
        # 数据库初始化失败，记录日志但不影响启动
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"数据库初始化失败: {e}", exc_info=True)


def get_db() -> Generator[Session, None, None]:
    """向后兼容：默认返回用户组库会话。"""
    ensure_domain_allows(ServiceDomain.users)
    db = SessionUsers()
    try:
        yield db
    finally:
        db.close()


def get_db_users() -> Generator[Session, None, None]:
    ensure_domain_allows(ServiceDomain.users)
    db = SessionUsers()
    try:
        yield db
    finally:
        db.close()


def get_db_pool() -> Generator[Session, None, None]:
    ensure_domain_allows(ServiceDomain.pool)
    db = SessionPool()
    try:
        yield db
    finally:
        db.close()
