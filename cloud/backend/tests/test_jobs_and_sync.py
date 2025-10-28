from unittest.mock import patch
import pytest
from sqlalchemy.orm import Session

from app import models
from app.services.services.jobs import JobRunner, enqueue_users_job, process_one_job
from app.services.services import admin_jobs
from app.services.services.maintenance import create_maintenance_service


def _make_invite(db: Session, email: str, team_id: str, status: models.InviteStatus = models.InviteStatus.sent):
    inv = models.InviteRequest(
        mother_id=None,
        team_id=team_id,
        email=email,
        status=status,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def test_enqueue_and_process_users_job(db_session):
    # create a couple invites
    inv1 = _make_invite(db_session, 'u1@example.com', 'team-1')
    inv2 = _make_invite(db_session, 'u2@example.com', 'team-1')

    job = enqueue_users_job(db_session, 'resend', [inv1.id, inv2.id], actor='test')
    assert job.id is not None

    with patch('app.services.services.invites.InviteService.resend_invite', return_value=(True, 'ok')):
        ok = process_one_job(db_session)

    assert ok is True
    job_row = db_session.query(models.BatchJob).filter(models.BatchJob.id == job.id).first()
    assert job_row is not None
    assert job_row.status == models.BatchJobStatus.succeeded
    assert (job_row.success_count or 0) >= 1

def test_jobrunner_process_one_job(db_session):
    inv = _make_invite(db_session, 'solo@example.com', 'team-2')
    enqueue_users_job(db_session, 'resend', [inv.id], actor='runner')

    # 共享同一会话以匹配测试数据库（双库同源）
    runner = JobRunner(db_session, pool_session_factory=lambda: db_session)
    with patch('app.services.services.invites.InviteService.resend_invite', return_value=(True, 'ok')):
        ok = runner.process_one_job()

    assert ok is True
    refreshed = db_session.query(models.BatchJob).order_by(models.BatchJob.id.desc()).first()
    assert refreshed is not None and refreshed.status == models.BatchJobStatus.succeeded


def test_sync_invite_acceptance_marks_accepted(db_session, sample_mothers):
    mother = sample_mothers[0]
    team = mother.teams[0]
    # sent invite for an email
    inv = models.InviteRequest(
        mother_id=mother.id,
        team_id=team.team_id,
        email='accept@example.com',
        status=models.InviteStatus.sent,
    )
    db_session.add(inv)
    db_session.commit()

    payload = {"data": {"memberships": [{"id": "mem-1", "user": {"email": "accept@example.com"}}]}}

    with patch('app.services.services.maintenance.provider.list_members', return_value=payload):
        service = create_maintenance_service(db_session, db_session)
        updated = service.sync_invite_acceptance(days=365, limit_groups=100)

    assert updated >= 1
    db_session.refresh(inv)
    assert inv.status == models.InviteStatus.accepted


def test_admin_jobs_service_flow(db_session):
    inv = _make_invite(db_session, 'svc@example.com', 'team-svc')
    job = enqueue_users_job(db_session, 'resend', [inv.id], actor='svc')
    # list
    items, pagination = admin_jobs.list_jobs(db_session, page=1, page_size=10)
    assert pagination["total"] >= 1
    assert any(j["id"] == job.id for j in items)

    detail = admin_jobs.get_job(db_session, job.id)
    assert detail["id"] == job.id

    retried = admin_jobs.retry_job(db_session, job.id)
    assert retried["status"] == models.BatchJobStatus.pending.value

    job.status = models.BatchJobStatus.running
    db_session.add(job)
    db_session.commit()
    with pytest.raises(ValueError):
        admin_jobs.retry_job(db_session, job.id)
