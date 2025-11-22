from __future__ import annotations

from datetime import datetime
from types import MethodType

from sqlalchemy.orm import sessionmaker

from app import models
from app.security import encrypt_token
from app.services.services.invites import InviteService
from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository


def test_invite_service_respects_session_boundaries(monkeypatch, test_engine):
    """InviteService.invite_email 应仅通过 Pool 会话访问池域模型，通过 Users 会话访问用户域模型。"""

    UsersSession = sessionmaker(bind=test_engine)
    PoolSession = sessionmaker(bind=test_engine)

    users_session = UsersSession()
    pool_session = PoolSession()

    # 清理并准备母号/团队/座位（Pool 库）
    pool_session.query(models.SeatAllocation).delete(synchronize_session=False)
    pool_session.query(models.MotherTeam).delete(synchronize_session=False)
    pool_session.query(models.MotherAccount).delete(synchronize_session=False)
    users_session.query(models.InviteRequest).delete(synchronize_session=False)
    users_session.query(models.RedeemCode).delete(synchronize_session=False)
    users_session.commit()
    pool_session.commit()

    mother = models.MotherAccount(
        name="mother@example.com",
        access_token_enc=encrypt_token("dummy-token"),
        status=models.MotherStatus.active,
        seat_limit=1,
    )
    pool_session.add(mother)
    pool_session.flush()

    team = models.MotherTeam(
        mother_id=mother.id,
        team_id="team-abc",
        team_name="Team ABC",
        is_enabled=True,
        is_default=True,
    )
    pool_session.add(team)
    pool_session.flush()

    seat = models.SeatAllocation(
        mother_id=mother.id,
        slot_index=1,
        status=models.SeatStatus.free,
    )
    pool_session.add(seat)
    pool_session.commit()

    code = models.RedeemCode(
        code_hash="hash-1",
        batch_id="batch-1",
        status=models.CodeStatus.unused,
        created_at=datetime.utcnow(),
    )
    users_session.add(code)
    users_session.commit()

    # 防止 Users 会话访问 Pool 模型 / Pool 会话访问 Users 模型
    original_users_query = users_session.__class__.query
    original_pool_query = pool_session.__class__.query

    def guarded_users_query(self, *entities, **kwargs):
        forbidden = {models.MotherAccount, models.MotherTeam, models.SeatAllocation}
        if any(entity in forbidden for entity in entities):
            raise AssertionError("Users session must not access Pool domain models")
        return original_users_query(self, *entities, **kwargs)

    def guarded_pool_query(self, *entities, **kwargs):
        forbidden = {models.InviteRequest, models.RedeemCode}
        if any(entity in forbidden for entity in entities):
            raise AssertionError("Pool session must not access Users domain models")
        return original_pool_query(self, *entities, **kwargs)

    users_session.query = MethodType(guarded_users_query, users_session)
    pool_session.query = MethodType(guarded_pool_query, pool_session)

    service = InviteService(UsersRepository(users_session), MotherRepository(pool_session))

    # Patch provider 调用，避免实际外部请求
    def fake_send_invite(token, team_id, email, role="standard-user", resend=True):
        return {"invites": [{"id": "invite-1"}]}

    def fake_list_members(token, team_id, offset=0, limit=25, query=""):
        return {"items": []}

    monkeypatch.setattr("app.services.services.invites.provider.send_invite", fake_send_invite)
    monkeypatch.setattr("app.services.services.invites.provider.list_members", fake_list_members)

    try:
        ok, msg, invite_id, mother_id, team_id = service.invite_email("user@example.com", code)

        assert ok is True
        assert invite_id is not None
        assert mother_id == mother.id
        assert team_id == team.team_id

        # 验证状态更新
        refreshed_seat = pool_session.get(models.SeatAllocation, seat.id)
        assert refreshed_seat.status == models.SeatStatus.used
        assert refreshed_seat.email == "user@example.com"

        refreshed_code = users_session.get(models.RedeemCode, code.id)
        assert refreshed_code.status == models.CodeStatus.used

        refreshed_invite = (
            users_session.query(models.InviteRequest)
            .filter(models.InviteRequest.email == "user@example.com")
            .first()
        )
        assert refreshed_invite is not None
        assert refreshed_invite.status == models.InviteStatus.sent
    finally:
        # 恢复 query 方法，避免影响其他用例
        users_session.query = MethodType(original_users_query, users_session)
        pool_session.query = MethodType(original_pool_query, pool_session)
        users_session.close()
        pool_session.close()
