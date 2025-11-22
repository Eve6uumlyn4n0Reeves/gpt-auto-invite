#!/usr/bin/env python3
"""
Verify that dual DB migrations created disjoint schemas.

The script reads DATABASE_URL_USERS and DATABASE_URL_POOL from env,
introspects table sets, and asserts no cross-boundary tables exist.
"""
import os
import sys
from sqlalchemy import create_engine, inspect


def main() -> int:
    url_users = os.environ.get("DATABASE_URL_USERS")
    url_pool = os.environ.get("DATABASE_URL_POOL")
    if not url_users or not url_pool:
        print("Missing DATABASE_URL_USERS or DATABASE_URL_POOL", file=sys.stderr)
        return 2

    # 从元数据自动派生白名单，减少维护成本
    try:
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        # 导入模型以填充元数据表
        from app import models  # noqa: F401
        from app.database import BaseUsers, BasePool  # type: ignore
        users_allowed = set(BaseUsers.metadata.tables.keys()) | {"alembic_version"}
        pool_allowed = set(BasePool.metadata.tables.keys()) | {"alembic_version"}
    except Exception:
        # 回退到硬编码集合（极端情况下）
        users_allowed = {
            "invite_requests",
            "redeem_codes",
            "admin_config",
            "admin_sessions",
            "audit_logs",
            "bulk_operation_logs",
            "batch_jobs",
            "alembic_version",
        }
        pool_allowed = {
            "mother_groups",
            "pool_groups",
            "pool_group_settings",
            "group_daily_sequences",
            "mother_accounts",
            "mother_teams",
            "child_accounts",
            "seats",
            "alembic_version",
        }

    def get_tables(url: str) -> set[str]:
        eng = create_engine(url)
        try:
            with eng.connect() as conn:
                insp = inspect(conn)
                return set(insp.get_table_names())
        finally:
            eng.dispose()

    users_tables = get_tables(url_users)
    pool_tables = get_tables(url_pool)

    print("Users tables:", sorted(users_tables))
    print("Pool tables:", sorted(pool_tables))

    # empty DBs are failure: migrations should create schemas
    if not users_tables or not pool_tables:
        print("One of the DBs has no tables after migration.", file=sys.stderr)
        return 3

    # boundary checks
    users_extras = users_tables - users_allowed
    pool_extras = pool_tables - pool_allowed

    # critical cross-boundary names
    cross_on_users = pool_allowed.intersection(users_extras)
    cross_on_pool = users_allowed.intersection(pool_extras)

    ok = True
    if users_extras:
        ok = False
        print("Unexpected tables in USERS DB:", sorted(users_extras), file=sys.stderr)
    if pool_extras:
        ok = False
        print("Unexpected tables in POOL DB:", sorted(pool_extras), file=sys.stderr)
    if cross_on_users:
        ok = False
        print("Pool-only tables found in USERS DB:", sorted(cross_on_users), file=sys.stderr)
    if cross_on_pool:
        ok = False
        print("Users-only tables found in POOL DB:", sorted(cross_on_pool), file=sys.stderr)

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
