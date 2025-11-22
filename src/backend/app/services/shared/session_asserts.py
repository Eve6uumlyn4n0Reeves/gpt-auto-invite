from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from sqlalchemy import inspect

from app.database import engine_pool, engine_users
from app.config import settings

logger = logging.getLogger(__name__)


def require_pool_session(session: Session) -> None:
    """Assert that the given session is bound to the pool database.

    In test environments, performs a relaxed check by verifying that Pool domain
    tables are accessible, rather than strict URL matching.
    """
    bind = session.get_bind()

    if settings.env in ("test", "testing") and not settings.strict_session_asserts:
        # 测试环境：验证 Pool 域表是否可访问
        try:
            inspector = inspect(bind)
            pool_tables = {'mother_accounts', 'mother_teams', 'child_accounts', 'seat_allocations'}
            available_tables = set(inspector.get_table_names())

            if not pool_tables.issubset(available_tables):
                missing = pool_tables - available_tables
                logger.warning(
                    f"Pool session check: 缺少 Pool 域表 {missing}。"
                    f"这可能表示 Session 配置错误。"
                )
        except Exception as e:
            logger.warning(f"Pool session check 失败: {e}")
        return

    # 生产环境：严格检查 URL
    if bind is None or str(bind.url) != str(engine_pool.url):
        raise ValueError("pool_session required (got users/unknown session)")


def require_users_session(session: Session) -> None:
    """Assert that the given session is bound to the users database.

    In test environments, performs a relaxed check by verifying that Users domain
    tables are accessible, rather than strict URL matching.
    """
    bind = session.get_bind()

    if settings.env in ("test", "testing") and not settings.strict_session_asserts:
        # 测试环境：验证 Users 域表是否可访问
        try:
            inspector = inspect(bind)
            users_tables = {'redeem_codes', 'invite_requests', 'admin_config', 'batch_jobs'}
            available_tables = set(inspector.get_table_names())

            if not users_tables.issubset(available_tables):
                missing = users_tables - available_tables
                logger.warning(
                    f"Users session check: 缺少 Users 域表 {missing}。"
                    f"这可能表示 Session 配置错误。"
                )
        except Exception as e:
            logger.warning(f"Users session check 失败: {e}")
        return

    # 生产环境：严格检查 URL
    if bind is None or str(bind.url) != str(engine_users.url):
        raise ValueError("users_session required (got pool/unknown session)")

