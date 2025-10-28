#!/usr/bin/env python3
"""
导出 Users / Pool 数据库的表结构与数据量级快照。

使用示例：

    python cloud/backend/scripts/export_db_snapshot.py --output cloud/docs/snapshots/db-snapshot.json

若未提供 --output，将在终端输出 JSON。
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError


def _load_app_context():
    """确保可以导入 app.* 模块。"""
    scripts_dir = pathlib.Path(__file__).resolve().parent
    backend_dir = scripts_dir.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.config import settings  # type: ignore
    # 导入模型以填充 Base 元数据
    from app import models  # type: ignore  # noqa: F401
    from app.database import BaseUsers, BasePool  # type: ignore

    return settings, BaseUsers, BasePool


def _collect_table_stats(
    engine: Engine,
    tables: Iterable[Any],
    allowed_table_names: Iterable[str],
) -> Dict[str, Any]:
    """统计指定数据库的表信息。"""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    allowed_names = set(allowed_table_names)

    stats: List[Dict[str, Any]] = []
    missing_tables: List[str] = []
    with engine.connect() as conn:
        for table in tables:
            table_name = table.name
            if table_name not in existing_tables:
                missing_tables.append(table_name)
                continue

            try:
                row_count = conn.execute(select(func.count()).select_from(table)).scalar_one()
            except SQLAlchemyError as exc:
                row_count = None
                stats.append(
                    {
                        "table": table_name,
                        "rows": row_count,
                        "error": str(exc),
                    }
                )
                continue

            table_info: Dict[str, Any] = {"table": table_name, "rows": row_count}

            if engine.dialect.name == "postgresql":
                try:
                    size_bytes = conn.execute(
                        text("SELECT pg_total_relation_size(:table_name)"),
                        {"table_name": table_name},
                    ).scalar_one()
                except SQLAlchemyError:
                    size_bytes = None
                table_info["size_bytes"] = size_bytes

            stats.append(table_info)

        alembic_version = None
        if "alembic_version" in existing_tables:
            try:
                alembic_version = conn.execute(
                    text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1")
                ).scalar_one_or_none()
            except SQLAlchemyError:
                alembic_version = None

    extras = sorted(existing_tables - allowed_names)

    aggregate = {
        "dialect": engine.dialect.name,
        "driver": engine.dialect.driver,
        "tables_found": sorted(existing_tables),
        "table_stats": stats,
        "alembic_version": alembic_version,
        "missing_expected_tables": sorted(missing_tables),
        "unexpected_tables": extras,
    }

    if engine.dialect.name == "sqlite":
        db_path = engine.url.database
        if db_path and os.path.exists(db_path):
            aggregate["database_file_bytes"] = os.path.getsize(db_path)

    aggregate["row_total"] = sum(item.get("rows") or 0 for item in stats if isinstance(item.get("rows"), int))
    return aggregate


def export_snapshot(output_path: pathlib.Path | None = None) -> Dict[str, Any]:
    settings, BaseUsers, BasePool = _load_app_context()

    engines: Dict[str, Engine] = {
        "users": create_engine(settings.database_url_users),
        "pool": create_engine(settings.database_url_pool),
    }

    snapshot: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "users": {},
        "pool": {},
    }

    try:
        snapshot["users"] = {
            "url": str(engines["users"].url),
            **_collect_table_stats(
                engines["users"],
                BaseUsers.metadata.sorted_tables,
                BaseUsers.metadata.tables.keys(),
            ),
        }
        snapshot["pool"] = {
            "url": str(engines["pool"].url),
            **_collect_table_stats(
                engines["pool"],
                BasePool.metadata.sorted_tables,
                BasePool.metadata.tables.keys(),
            ),
        }
    finally:
        for engine in engines.values():
            engine.dispose()

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))

    return snapshot


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="导出双库数据量级快照")
    parser.add_argument("--output", type=pathlib.Path, help="输出 JSON 文件路径，可选")
    args = parser.parse_args(argv)

    snapshot = export_snapshot(args.output)
    if args.output is None:
        print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    else:
        print(f"Snapshot written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
