from __future__ import annotations

from unittest.mock import patch
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.services.services.team_naming import TeamNamingService
from app.services.services.jobs import process_one_job


def test_next_seq_and_team_name(db_session: Session):
    # create pool group and settings
    g = models.PoolGroup(name="Pool-A", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)

    s = models.PoolGroupSettings(group_id=g.id, team_template="{group}-{date}-{seq3}")
    db_session.add(s)
    db_session.commit()

    # same day increments
    v1 = TeamNamingService.next_seq(db_session, g.id, 'team', datetime.utcnow().strftime('%Y%m%d'))
    v2 = TeamNamingService.next_seq(db_session, g.id, 'team', datetime.utcnow().strftime('%Y%m%d'))
    assert v1 == 1 and v2 == 2

    # new day resets
    v3 = TeamNamingService.next_seq(db_session, g.id, 'team', '20990101')
    assert v3 == 1

    # name generation
    name = TeamNamingService.next_team_name(db_session, g, s)
    assert name.startswith('Pool-A-') and name.count('-') >= 2


def test_import_cookie_pool_mode_enqueue(test_client: TestClient, db_session: Session):
    # create pool group
    g = models.PoolGroup(name="Pool-B", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.add(models.PoolGroupSettings(group_id=g.id))
    db_session.commit()

    fake_token = "tok-abc"
    fake_exp = datetime.utcnow() + timedelta(days=30)
    fake_email = "owner@example.com"
    fake_account = "team-xyz"

    with patch('app.provider.fetch_session_via_cookie', return_value=(fake_token, fake_exp, fake_email, fake_account)):
        resp = test_client.post(
            "/api/admin/import-cookie",
            json={"cookie": "__Secure-next-auth.session-token=aaa", "mode": "pool", "pool_group_id": g.id},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("access_token") == fake_token
    assert data.get("user_email") == fake_email
    job_id = data.get("job_id")
    assert isinstance(job_id, int) and job_id > 0

    # ensure mother created and linked
    mother = db_session.query(models.MotherAccount).filter(models.MotherAccount.name == fake_email).first()
    assert mother is not None and mother.pool_group_id == g.id


def test_process_pool_sync_job(db_session: Session):
    # setup group, settings, mother, team
    g = models.PoolGroup(name="Pool-C", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.add(models.PoolGroupSettings(group_id=g.id, team_template="{group}-{date}-{seq3}"))
    db_session.commit()

    m = models.MotherAccount(
        name="mother@example.com",
        access_token_enc=__import__('app.security', fromlist=['encrypt_token']).encrypt_token("tok-test"),
        status=models.MotherStatus.active,
        seat_limit=2,
        pool_group_id=g.id,
    )
    db_session.add(m)
    db_session.flush()
    db_session.add(models.MotherTeam(mother_id=m.id, team_id="team-1", team_name="Team 1", is_enabled=True, is_default=True))
    db_session.commit()

    job = models.BatchJob(job_type=models.BatchJobType.pool_sync_mother, status=models.BatchJobStatus.pending, payload_json='{"mother_id": %d}' % m.id)
    db_session.add(job)
    db_session.commit()

    payload_members = {"items": [{"id": "mem-1", "email": "child1@example.com", "name": "Child 1"}]}
    with patch('app.provider.update_team_info', return_value={"ok": True}), \
         patch('app.provider.list_members', return_value=payload_members), \
         patch('app.provider.send_invite', return_value={"ok": True}):
        ok = process_one_job(db_session)

    assert ok is True
    job_row = db_session.query(models.BatchJob).filter(models.BatchJob.id == job.id).first()
    assert job_row.status in (models.BatchJobStatus.succeeded, models.BatchJobStatus.pending)
    # verify team name updated and child synced
    t = db_session.query(models.MotherTeam).filter(models.MotherTeam.mother_id == m.id).first()
    assert t is not None and isinstance(t.team_name, str) and len(t.team_name) > 0
    child = db_session.query(models.ChildAccount).filter(models.ChildAccount.mother_id == m.id).first()
    assert child is not None


