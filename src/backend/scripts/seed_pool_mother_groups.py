from __future__ import annotations

import structlog
from sqlalchemy.orm import Session
import os, sys
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.database import SessionPool
from app import models

logger = structlog.get_logger(__name__)


def run():
    sess: Session = SessionPool()
    try:
        # if table empty, seed a few rows
        if sess.query(models.MotherGroup).count() == 0:
            rows = [
                models.MotherGroup(name="GroupA", description="desc A", team_name_template="{group}-{date}", is_active=True),
                models.MotherGroup(name="GroupB", description="desc B", team_name_template=None, is_active=True),
                models.MotherGroup(name="GroupC", description=None, team_name_template="{group}", is_active=False),
            ]
            for r in rows:
                sess.add(r)
                sess.flush()
                try:
                    sess.add(models.MotherGroupSettings(group_id=r.id, team_name_template=r.team_name_template))
                except Exception:
                    pass
            sess.commit()
            logger.info("seeded", count=len(rows))
        else:
            logger.info("pool.mother_groups not empty, skip seeding")
    finally:
        sess.close()


if __name__ == "__main__":
    run()

