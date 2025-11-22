from __future__ import annotations

from unittest.mock import patch
from datetime import datetime

from sqlalchemy.orm import Session

from app import models
from app.services.services.pool import run_pool_sync
from app.config import settings


def _seed_group_and_mother(db: Session):
    g = models.PoolGroup(name="Pool-Regex", is_active=True, created_at=datetime.utcnow())
    db.add(g)
    db.commit()
    db.add(models.PoolGroupSettings(group_id=g.id, team_template="{group}-{date}-{seq3}"))
    db.commit()

    m = models.MotherAccount(
        name="owner@regex.local",
        access_token_enc=None,
        status=models.MotherStatus.active,
        seat_limit=1,
        pool_group_id=g.id,
    )
    db.add(m)
    db.flush()
    # 预置一个已符合模板的团队名，确保不会重命名
    tname = f"Pool-Regex-20990101-001"
    db.add(models.MotherTeam(mother_id=m.id, team_id="team-regex", team_name=tname, is_enabled=True, is_default=True))
    db.commit()
    return g, m


def test_rename_idempotent_skip_if_matches_template(db_session: Session):
    g, m = _seed_group_and_mother(db_session)
    # 不提供 access_token，run_pool_sync 会用 dummy token，方便打桩
    with patch('app.provider.update_team_info') as stub_update, \
         patch('app.provider.list_members', return_value={"items": []}):
        renamed, synced = run_pool_sync(db_session, m.id)
    # 已匹配模板，应不重命名
    assert renamed == 0
    assert stub_update.call_count == 0


def test_auto_invite_idempotent(db_session: Session):
    settings.pool_auto_invite_missing = True
    g = models.PoolGroup(name="Pool-Auto", is_active=True, created_at=datetime.utcnow())
    db_session.add(g)
    db_session.commit()
    db_session.add(models.PoolGroupSettings(group_id=g.id, team_template="{group}-{date}-{seq3}"))
    db_session.commit()

    m = models.MotherAccount(
        name="owner@auto.local",
        access_token_enc=None,
        status=models.MotherStatus.active,
        seat_limit=1,
        pool_group_id=g.id,
    )
    db_session.add(m)
    db_session.flush()
    db_session.add(models.MotherTeam(mother_id=m.id, team_id="team-auto", team_name="Team Auto", is_enabled=True, is_default=True))
    # 添加一个空 seat 供自动邀请
    db_session.add(models.SeatAllocation(mother_id=m.id, slot_index=1, status=models.SeatStatus.free))
    db_session.commit()

    with patch('app.provider.update_team_info', return_value={"ok": True}), \
         patch('app.provider.list_members', return_value={"items": []}), \
         patch('app.provider.send_invite', return_value={"ok": True}) as stub_invite:
        # 第一次执行：应邀请一次
        run_pool_sync(db_session, m.id)
        # 第二次执行：seat 已使用，不应再次邀请
        run_pool_sync(db_session, m.id)

    assert stub_invite.call_count == 1

