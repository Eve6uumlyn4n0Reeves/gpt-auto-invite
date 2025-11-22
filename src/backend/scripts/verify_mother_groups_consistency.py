from __future__ import annotations

import argparse
import random
import structlog
from typing import List

from sqlalchemy.orm import Session
import os, sys
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.database import SessionPool, SessionUsers
from app import models

logger = structlog.get_logger(__name__)


def verify(sample_size: int = 20) -> int:
    """Verify Pool vs Users mother_groups (and settings) consistency.

    Returns 0 if all checks pass; otherwise returns non-zero.
    """
    pool: Session = SessionPool()
    users: Session = SessionUsers()
    status = 0
    try:
        # 1) Counts
        c_pool = pool.query(models.MotherGroup).count()
        c_users = users.query(models.MotherGroupUsers).count()
        logger.info("count", pool=c_pool, users=c_users)
        if c_pool != c_users:
            logger.error("count mismatch", pool=c_pool, users=c_users)
            status = 2

        # 2) ID set equality
        ids_pool = {i for (i,) in pool.query(models.MotherGroup.id).all()}
        ids_users = {i for (i,) in users.query(models.MotherGroupUsers.id).all()}
        missing_in_users = sorted(list(ids_pool - ids_users))
        extra_in_users = sorted(list(ids_users - ids_pool))
        if missing_in_users:
            logger.error("missing in users", ids=missing_in_users[:50], count=len(missing_in_users))
            status = 2
        if extra_in_users:
            logger.warning("extra in users (ok if created after migration)", ids=extra_in_users[:50], count=len(extra_in_users))

        # 3) Sampled field hash match
        sample_ids: List[int] = random.sample(list(ids_pool), min(sample_size, len(ids_pool))) if ids_pool else []
        mismatches = 0
        for gid in sample_ids:
            p = pool.get(models.MotherGroup, gid)
            u = users.get(models.MotherGroupUsers, gid)
            if not p or not u:
                mismatches += 1
                continue
            key_p = (p.name, p.description or "", p.team_name_template or "", bool(p.is_active))
            key_u = (u.name, u.description or "", u.team_name_template or "", bool(u.is_active))
            if key_p != key_u:
                mismatches += 1
                logger.error("field mismatch", id=gid, pool=key_p, users=key_u)
        if mismatches:
            logger.error("sample mismatch count", count=mismatches)
            status = 3 if status == 0 else status
        else:
            logger.info("sample verified", size=len(sample_ids))

        # 4) Settings
        c_pool_s = pool.query(models.MotherGroupSettings).count()
        c_users_s = users.query(models.MotherGroupSettingsUsers).count()
        logger.info("settings count", pool=c_pool_s, users=c_users_s)
        # Not strictly equal; users may have fewer if pool had none

        # 5) RedeemCode reference validity in Users DB
        rc_ids = {i for (i,) in users.query(models.RedeemCode.mother_group_id).filter(models.RedeemCode.mother_group_id != None).all()}  # noqa: E711
        invalid_refs = sorted(list(rc_ids - ids_users))
        if invalid_refs:
            logger.error("redeem_code invalid mother_group_id", ids=invalid_refs[:50], count=len(invalid_refs))
            status = 4 if status == 0 else status
        else:
            logger.info("redeem_code refs valid", count=len(rc_ids))

        if status == 0:
            logger.info("CONSISTENCY PASS")
        else:
            logger.error("CONSISTENCY FAILED", status=status)
        return status
    finally:
        pool.close()
        users.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify Users vs Pool mother_groups consistency")
    parser.add_argument("--sample", type=int, default=20, help="sample size for field comparison")
    args = parser.parse_args()
    exit(verify(sample_size=args.sample))

