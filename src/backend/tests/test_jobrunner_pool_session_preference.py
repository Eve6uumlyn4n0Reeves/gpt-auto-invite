from unittest.mock import patch

from sqlalchemy.orm import Session

from app import models
from app.services.services.jobs import JobRunner


def test_jobrunner_prefers_custom_pool_session_in_test_env(db_session: Session):
    # Arrange: create mother and job
    g = models.PoolGroup(name="Pool-T", is_active=True)
    db_session.add(g)
    db_session.commit()
    m = models.MotherAccount(name="mother@test.local", access_token_enc="enc", status=models.MotherStatus.active, seat_limit=1, pool_group_id=g.id)
    db_session.add(m)
    db_session.flush()
    db_session.add(models.MotherTeam(mother_id=m.id, team_id="team-T", team_name="Team T", is_enabled=True, is_default=True))
    db_session.commit()

    job = models.BatchJob(job_type=models.BatchJobType.pool_sync_mother, status=models.BatchJobStatus.pending, payload_json='{"mother_id": %d}' % m.id)
    db_session.add(job)
    db_session.commit()

    called = {"used_session": None}

    def _fake_run_pool_sync(sess: Session, mother_id: int):  # noqa: ANN001
        called["used_session"] = sess
        return 0, 0

    runner = JobRunner(db_session, pool_session_factory=lambda: db_session)

    # Act
    with patch("app.services.services.pool.run_pool_sync", _fake_run_pool_sync):
        ok, fail = runner._run_pool_sync_job(job)

    # Assert
    assert ok == 0 and fail == 0
    assert called["used_session"] is db_session, "_run_pool_sync_job should use provided pool_session_factory in test env"

