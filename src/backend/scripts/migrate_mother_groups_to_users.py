from __future__ import annotations

import argparse
import sys
import time
from typing import Optional

import structlog
from sqlalchemy.orm import Session
from sqlalchemy import func

# Ensure src/backend on path if run directly
import os
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

try:
    from app.config import settings
    from app.database import SessionPool, SessionUsers
    from app import models
except Exception as e:  # pragma: no cover
    print(f"Failed to import app modules: {e}")
    raise

logger = structlog.get_logger(__name__)


def migrate(batch_size: int = 1000, sleep_between: float = 0.0) -> None:
    """Backfill pool.mother_groups -> users.mother_groups keeping the same id.

    - Idempotent: skips rows that already exist in Users by id
    - Batches to avoid long transactions
    - Also sync mother_group_settings by group_id (upsert)
    """
    start = time.time()
    total = inserted = skipped = failed = 0

    pool_sess: Session = SessionPool()
    users_sess: Session = SessionUsers()
    try:
        # Determine max id to iterate in batches
        max_id: Optional[int] = pool_sess.query(func.max(models.MotherGroup.id)).scalar()
        if not max_id:
            logger.info("no mother_groups found in pool; nothing to migrate")
            return

        cur = 0
        while cur <= max_id:
            upper = cur + batch_size
            batch = (
                pool_sess.query(models.MotherGroup)
                .filter(models.MotherGroup.id > cur, models.MotherGroup.id <= upper)
                .order_by(models.MotherGroup.id.asc())
                .all()
            )
            if not batch:
                cur = upper
                continue

            for row in batch:
                total += 1
                try:
                    exists = users_sess.get(models.MotherGroupUsers, row.id)
                    if exists:
                        skipped += 1
                        continue

                    clone = models.MotherGroupUsers(
                        id=row.id,
                        name=row.name,
                        description=row.description,
                        team_name_template=row.team_name_template,
                        is_active=row.is_active,
                        created_at=row.created_at,
                        updated_at=row.updated_at,
                    )
                    users_sess.add(clone)
                    # settings upsert
                    try:
                        s_pool = (
                            pool_sess.query(models.MotherGroupSettings)
                            .filter(models.MotherGroupSettings.group_id == row.id)
                            .first()
                        )
                        if s_pool:
                            s_user = (
                                users_sess.query(models.MotherGroupSettingsUsers)
                                .filter(models.MotherGroupSettingsUsers.group_id == row.id)
                                .first()
                            )
                            if not s_user:
                                s_user = models.MotherGroupSettingsUsers(group_id=row.id)
                            s_user.team_name_template = s_pool.team_name_template
                            users_sess.add(s_user)
                    except Exception as se:
                        logger.warning("settings sync failed", group_id=row.id, err=str(se))

                    users_sess.commit()
                    inserted += 1
                except Exception as e:
                    users_sess.rollback()
                    failed += 1
                    logger.error("migrate one failed", id=row.id, name=row.name, err=str(e))

            cur = upper
            if sleep_between > 0:
                time.sleep(sleep_between)

        elapsed = time.time() - start
        logger.info(
            "migration finished",
            total=total,
            inserted=inserted,
            skipped=skipped,
            failed=failed,
            seconds=round(elapsed, 2),
        )
    finally:
        users_sess.close()
        pool_sess.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill mother_groups from Pool to Users DB (keep same id)")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--sleep-between", type=float, default=0.0, help="seconds to sleep between batches")
    args = parser.parse_args()

    migrate(batch_size=args.batch_size, sleep_between=args.sleep_between)

