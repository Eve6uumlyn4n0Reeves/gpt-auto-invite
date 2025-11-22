"""Alembic environment for Pool DB.

Usage:
  alembic -c cloud/backend/alembic_pool.ini revision -m "..."
  alembic -c cloud/backend/alembic_pool.ini upgrade head
"""
from __future__ import annotations

from logging.config import fileConfig
from alembic import context
from sqlalchemy import create_engine, pool

# Import application metadata
import os, sys
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
from app.database import BasePool
from app.config import settings

# Import all Pool models to ensure they're registered with BasePool.metadata
from app import models  # noqa: F401
from app import models_pool_api  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = BasePool.metadata


def get_url() -> str:
    return settings.database_url_pool


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = get_url()
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=False,  # 只处理当前schema
            render_as_batch=True,  # SQLite批量模式
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
