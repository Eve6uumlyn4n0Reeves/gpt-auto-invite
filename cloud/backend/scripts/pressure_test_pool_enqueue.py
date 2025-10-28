#!/usr/bin/env python3
"""
Pressure test for pool_sync_mother enqueue de-duplication.

Runs N concurrent attempts to enqueue the same (mother_id, group_id) pair and
verifies that only one BatchJob is created in PENDING/RUNNING status.

Usage:
  python cloud/backend/scripts/pressure_test_pool_enqueue.py --mother 1 --group 1 --attempts 100

If --mother/--group are omitted, creates a temporary MotherAccount and PoolGroup
in the Pool DB for testing.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
from typing import Tuple

from sqlalchemy.orm import Session

from app.database import SessionUsers, SessionPool
from app import models
from app.services.services.pool_group import enqueue_pool_group_sync


def ensure_entities(pool_sess: Session) -> Tuple[int, int]:
    # Create minimal mother + group if not exists
    mother = pool_sess.query(models.MotherAccount).first()
    if not mother:
        mother = models.MotherAccount(name="pressure@example.com", access_token_enc="dGVzdA==")
        pool_sess.add(mother)
        pool_sess.flush()
    group = pool_sess.query(models.PoolGroup).first()
    if not group:
        group = models.PoolGroup(name="Pressure-Group")
        pool_sess.add(group)
        pool_sess.flush()
    pool_sess.commit()
    return mother.id, group.id


def attempt(pool_id: int, users_id: int, mother_id: int, group_id: int) -> int | None:
    pool_db = SessionPool()
    users_db = SessionUsers()
    try:
        job = enqueue_pool_group_sync(pool_db, users_db, mother_id=mother_id, group_id=group_id)
        users_db.commit()
        return job.id if job else None
    except Exception:
        users_db.rollback()
        return None
    finally:
        users_db.close()
        pool_db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mother", type=int, default=0)
    parser.add_argument("--group", type=int, default=0)
    parser.add_argument("--attempts", type=int, default=100)
    args = parser.parse_args()

    pool_db = SessionPool()
    try:
        mother_id = args.mother
        group_id = args.group
        if not mother_id or not group_id:
            mother_id, group_id = ensure_entities(pool_db)
    finally:
        pool_db.close()

    job_ids: list[int | None] = []
    with futures.ThreadPoolExecutor(max_workers=min(64, args.attempts)) as ex:
        futs = [ex.submit(attempt, 0, 0, mother_id, group_id) for _ in range(args.attempts)]
        for f in futs:
            job_ids.append(f.result())

    uniq = sorted({j for j in job_ids if j is not None})
    print(f"Attempts={args.attempts}, created_jobs={len(uniq)}, job_ids={uniq}")

    # Validate de-duplication: at most one job created
    if len(uniq) <= 1:
        print("OK: de-duplication effective")
        return 0
    else:
        print("FAIL: multiple jobs created for same (mother, group)")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

