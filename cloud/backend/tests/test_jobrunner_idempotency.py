from __future__ import annotations

from unittest.mock import patch
from datetime import datetime

from sqlalchemy.orm import Session

from app import models
from app.services.services.jobs import process_one_job


def _seed_pool_entities(db: Session):
    g = models.PoolGroup(name="Pool-Idem", is_active=True, created_at=datetime.utcnow())
    db.add(g)
    db.commit()
    db.add(models.PoolGroupSettings(group_id=g.id, team_template="{group}-{date}-{seq3}"))
    db.commit()

    m = models.MotherAccount(
        name="idem@example.com",
        access_token_enc=__import__('app.security', fromlist=['encrypt_token']).encrypt_token("tok-idem"),
        status=models.MotherStatus.active,
        seat_limit=2,
        pool_group_id=g.id,
    )
    db.add(m)
    db.flush()
    db.add(models.MotherTeam(mother_id=m.id, team_id="team-idem", team_name="Team Idem", is_enabled=True, is_default=True))
    db.commit()
    return g, m


def test_pool_sync_idempotent_twice(db_session: Session):
    g, m = _seed_pool_entities(db_session)

    # enqueue two identical jobs
    j1 = models.BatchJob(job_type=models.BatchJobType.pool_sync_mother, status=models.BatchJobStatus.pending, payload_json=f'{"{"}"mother_id"{":"}{m.id}{"}"}')
    j2 = models.BatchJob(job_type=models.BatchJobType.pool_sync_mother, status=models.BatchJobStatus.pending, payload_json=f'{"{"}"mother_id"{":"}{m.id}{"}"}')
    db_session.add_all([j1, j2])
    db_session.commit()

    payload_members = {"items": [{"id": "mem-1", "email": "child1@example.com", "name": "Child 1"}]}

    with patch('app.provider.update_team_info', return_value={"ok": True}), \
         patch('app.provider.list_members', return_value=payload_members), \
         patch('app.provider.send_invite', return_value={"ok": True}):
        # process first
        ok1 = process_one_job(db_session)
        # process second
        ok2 = process_one_job(db_session)

    assert ok1 is True or ok2 is True
    # verify only one child exists for the same email
    children = db_session.query(models.ChildAccount).filter(models.ChildAccount.mother_id == m.id).all()
    emails = [c.email for c in children]
    assert len(children) == len(set(emails))

