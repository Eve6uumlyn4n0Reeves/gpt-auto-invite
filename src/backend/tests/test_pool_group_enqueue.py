from datetime import datetime

from app import models
from app.services.services.pool_group import enqueue_pool_group_sync as enqueue


def test_enqueue_pool_group_sync_dedup(db_session):
    # 准备：创建组与母号
    g = models.PoolGroup(name="Pool-D", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.add(models.PoolGroupSettings(group_id=g.id))
    db_session.commit()

    m = models.MotherAccount(
        name="mother@example.com",
        access_token_enc=None,
        status=models.MotherStatus.active,
        seat_limit=2,
        pool_group_id=g.id,
        created_at=datetime.utcnow(),
    )
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)

    # Users/Pool 在测试中为同一会话，服务内已豁免严格绑定校验
    job1 = enqueue(db_session, db_session, mother_id=m.id, group_id=g.id)
    job2 = enqueue(db_session, db_session, mother_id=m.id, group_id=g.id)

    assert job1.id == job2.id, "enqueue 去重应复用同一 Job"

