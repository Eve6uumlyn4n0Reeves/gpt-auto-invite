from unittest.mock import patch
from sqlalchemy.orm import Session

from app import models
from app.services.services.jobs import enqueue_users_job, process_one_job
from app.services.services.maintenance import sync_invite_acceptance


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

    with patch('app.services.services.jobs.resend_invite', return_value=(True, 'ok')):
        ok = process_one_job(db_session)

    assert ok is True
    job_row = db_session.query(models.BatchJob).filter(models.BatchJob.id == job.id).first()
    assert job_row is not None
    assert job_row.status == models.BatchJobStatus.succeeded
    assert (job_row.success_count or 0) >= 1


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
        updated = sync_invite_acceptance(db_session, days=365, limit_groups=100)

    assert updated >= 1
    db_session.refresh(inv)
    assert inv.status == models.InviteStatus.accepted
