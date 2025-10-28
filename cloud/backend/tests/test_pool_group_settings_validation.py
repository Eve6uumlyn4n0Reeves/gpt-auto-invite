from datetime import datetime

from app import models
from app.services.services.pool_group import update_pool_group_settings


def test_update_pool_group_settings_rejects_invalid_placeholder(db_session):
    g = models.PoolGroup(name="Pool-E", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.add(models.PoolGroupSettings(group_id=g.id))
    db_session.commit()

    try:
        update_pool_group_settings(
            db_session,
            g.id,
            team_template="{foo}-{date}-{seq3}",  # {foo} 非法
        )
        assert False, "should raise ValueError for invalid placeholder"
    except ValueError as exc:
        assert "invalid placeholder" in str(exc)

