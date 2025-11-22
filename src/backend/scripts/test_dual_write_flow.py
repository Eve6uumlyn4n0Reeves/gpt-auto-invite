from __future__ import annotations

import os, sys
import structlog

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.config import settings
from app.database import SessionPool, SessionUsers
from app import models
from app.services.services import mother_group_service as svc

log = structlog.get_logger(__name__)


def main():
    log.info("phase", phase=settings.mother_group_migration_phase)
    dbp = SessionPool()
    dbu = SessionUsers()
    try:
        # Create
        name = "DualTestGroup"
        row = svc.create(dbp, name=name, description="dual test", team_name_template="{g}", db_users=dbu)
        gid = getattr(row, "id", None)
        log.info("created", id=gid)

        # Update
        row2 = svc.update(dbp, gid, description="updated", db_users=dbu)
        log.info("updated", id=gid, desc=getattr(row2, "description", None))

        # Check presence both sides
        pool_has = dbp.get(models.MotherGroup, gid) is not None
        users_has = dbu.get(models.MotherGroupUsers, gid) is not None
        log.info("presence", pool=pool_has, users=users_has)

        # Delete
        svc.delete(dbp, gid, db_users=dbu)
        pool_has2 = dbp.get(models.MotherGroup, gid) is not None
        users_has2 = dbu.get(models.MotherGroupUsers, gid) is not None
        log.info("deleted", pool=pool_has2, users=users_has2)

    finally:
        dbp.close(); dbu.close()


if __name__ == "__main__":
    main()

