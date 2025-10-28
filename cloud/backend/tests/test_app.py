"""
简化后的集成/单元测试
"""
import asyncio
from typing import Optional
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import models
from app.services.services import admin as admin_services
from app.services.services.redeem import redeem_code, hash_code
from app.services.services.invites import remove_member
from app.services.services.rate_limiter_service import close_rate_limiter
from app.utils.utils.rate_limiter import RateLimitResult


def test_health_endpoint(test_client: TestClient):
    response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_redeem_success(test_client: TestClient, db_session, sample_redeem_codes, sample_mothers):
    code = models.RedeemCode(code_hash=hash_code("SUCCESSCODE"), batch_id="batch", status=models.CodeStatus.unused)
    db_session.add(code)
    db_session.commit()

    with patch("app.services.services.redeem.InviteService") as mock_invite_service:
        service = MagicMock()
        service.invite_email.return_value = (
            True,
            "邀请成功",
            1,
            sample_mothers[0].id,
            sample_mothers[0].teams[0].team_id,
        )
        mock_invite_service.return_value = service

        response = test_client.post(
            "/api/redeem",
            json={"code": "SUCCESSCODE", "email": "user@example.com"},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_redeem_invalid_code(test_client: TestClient):
    response = test_client.post(
        "/api/redeem",
        json={"code": "INVALIDCODE", "email": "user@example.com"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_admin_login_success(test_client: TestClient):
    response = test_client.post("/api/admin/login", json={"password": "admin123"})
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "admin_session" in response.cookies


def test_admin_login_wrong_password(test_client: TestClient):
    response = test_client.post("/api/admin/login", json={"password": "wrong"})
    assert response.status_code == 401


def test_admin_csrf_required(test_client: TestClient):
    login_resp = test_client.post("/api/admin/login", json={"password": "admin123"})
    assert login_resp.status_code == 200

    payload = {
        "name": "mother-csrf@example.com",
        "access_token": "token-secure-12345",
        "token_expires_at": None,
        "teams": [
            {
                "team_id": "team-csrf",
                "team_name": "Team CSRF",
                "is_enabled": True,
                "is_default": True,
            }
        ],
        "notes": "csrf test",
    }

    missing_token_resp = test_client.post("/api/admin/mothers", json=payload)
    assert missing_token_resp.status_code == 403

    csrf_resp = test_client.get("/api/admin/csrf-token")
    assert csrf_resp.status_code == 200
    csrf_token = csrf_resp.json()["csrf_token"]

    headers = {"X-CSRF-Token": csrf_token}
    with_token_resp = test_client.post("/api/admin/mothers", json=payload, headers=headers)
    assert with_token_resp.status_code == 200
    assert with_token_resp.json()["ok"] is True


def test_public_redeem_rate_limit(test_client: TestClient):
    class FakeLimiter:
        def __init__(self):
            self.remaining = 1

        async def allow(self, key: str, tokens: int = 1, *, config=None, strategy: Optional[str] = None, as_peek: bool = False):
            allowed = self.remaining >= tokens
            if allowed and not as_peek:
                self.remaining -= tokens
            retry_after = 0 if allowed else 1000
            return RateLimitResult(
                allowed=allowed,
                remaining=max(self.remaining, 0),
                retry_after_ms=retry_after,
                reset_at_ms=0,
                limit=1,
                key=key,
                strategy=strategy,
            )

        async def get_config(self, config_id: str):
            return None

    fake_limiter = FakeLimiter()

    async def fake_get_rate_limiter():
        return fake_limiter

    with patch("app.routers.routers.public.get_rate_limiter", side_effect=fake_get_rate_limiter):
        payload = {"code": "ABCDEFGH", "email": "rate@example.com"}
        first = test_client.post("/api/redeem", json=payload)
        assert first.status_code == 200

        second = test_client.post("/api/redeem", json=payload)
        assert second.status_code == 429
        assert second.json()["detail"] == "请求过于频繁，请稍后重试"


def test_public_redeem_rate_limit_enforced(test_client: TestClient):
    asyncio.run(close_rate_limiter())

    payload = {"code": "ABCDEFGH", "email": "rate-limit@example.com"}
    for _ in range(5):
        resp = test_client.post("/api/redeem", json=payload)
        assert resp.status_code == 200

    limited_resp = test_client.post("/api/redeem", json=payload)
    assert limited_resp.status_code == 429
    assert limited_resp.json()["detail"] == "请求过于频繁，请稍后重试"

    asyncio.run(close_rate_limiter())


def test_remove_member_resolves_member_id(db_session, sample_mothers):
    mother = sample_mothers[0]
    db_session.refresh(mother)
    team = mother.teams[0]
    seat = (
        db_session.query(models.SeatAllocation)
        .filter(models.SeatAllocation.mother_id == mother.id, models.SeatAllocation.slot_index == 1)
        .first()
    )
    assert seat is not None
    seat.status = models.SeatStatus.used
    seat.team_id = team.team_id
    seat.email = "user0@example.com"
    seat.member_id = None
    db_session.add(seat)
    db_session.commit()

    nested_response = {
        "data": {
            "memberships": [
                {
                    "id": "member-1",
                    "user": {"email": "user0@example.com"},
                }
            ]
        }
    }

    with patch("app.services.services.invites.provider.list_members", return_value=nested_response) as mock_list, patch(
        "app.services.services.invites.provider.delete_member", return_value={"ok": True}
    ) as mock_delete:
        ok, message = remove_member(db_session, db_session, "user0@example.com", team.team_id)

    assert ok is True
    assert message == "移除成功"
    mock_list.assert_called_once()
    assert mock_delete.call_count == 1
    assert mock_delete.call_args[0][2] == "member-1"

    updated_seat = (
        db_session.query(models.SeatAllocation)
        .filter(models.SeatAllocation.id == seat.id)
        .first()
    )
    assert updated_seat.status == models.SeatStatus.free
    assert updated_seat.member_id is None


def test_remove_member_returns_failure_when_member_missing(db_session, sample_mothers):
    mother = sample_mothers[1]
    db_session.refresh(mother)
    team = mother.teams[0]
    seat = (
        db_session.query(models.SeatAllocation)
        .filter(models.SeatAllocation.mother_id == mother.id, models.SeatAllocation.slot_index == 1)
        .first()
    )
    assert seat is not None
    seat.status = models.SeatStatus.used
    seat.team_id = team.team_id
    seat.email = "user1@example.com"
    seat.member_id = None
    db_session.add(seat)
    db_session.commit()

    with patch("app.services.services.invites.provider.list_members", return_value={"members": []}) as mock_list, patch(
        "app.services.services.invites.provider.delete_member"
    ) as mock_delete:
        ok, message = remove_member(db_session, db_session, "user1@example.com", team.team_id)

    assert ok is False
    assert message == "操作失败，请稍后重试"
    mock_list.assert_called_once()
    mock_delete.assert_not_called()

    unchanged_seat = (
        db_session.query(models.SeatAllocation)
        .filter(models.SeatAllocation.id == seat.id)
        .first()
    )
    assert unchanged_seat.status == models.SeatStatus.used


def test_admin_batch_users_resend_success(test_client: TestClient, db_session, sample_invites):
    asyncio.run(close_rate_limiter())

    login_resp = test_client.post("/api/admin/login", json={"password": "admin123"})
    assert login_resp.status_code == 200

    csrf = test_client.get("/api/admin/csrf-token")
    assert csrf.status_code == 200
    csrf_token = csrf.json()["csrf_token"]

    invite = sample_invites[0]
    payload = {"action": "resend", "ids": [invite.id], "confirm": True}
    headers = {"X-CSRF-Token": csrf_token}

    with patch("app.routers.admin.batch.resend_invite", return_value=(True, "ok")) as mock_resend:
        resp = test_client.post("/api/admin/batch/users", json=payload, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["processed_count"] == 1
    mock_resend.assert_called_once()
def test_admin_me_without_session(test_client: TestClient):
    response = test_client.get("/api/admin/me")
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


def test_create_mother_creates_seats(db_session):
    mother = admin_services.create_mother(
        db_session,
        name="mother@example.com",
        access_token="token",
        token_expires_at=None,
        teams=[
            {
                "team_id": "team-a",
                "team_name": "Team A",
                "is_enabled": True,
                "is_default": True,
            }
        ],
        notes=None,
    )
    seats = db_session.query(models.SeatAllocation).filter(models.SeatAllocation.mother_id == mother.id).all()
    assert len(seats) == mother.seat_limit


def test_redeem_code_concurrency(db_session):
    code_value = "CONCURRENT"
    redeem_row = models.RedeemCode(code_hash=hash_code(code_value), batch_id="batch", status=models.CodeStatus.unused)
    db_session.add(redeem_row)
    db_session.commit()

    results = []
    thread_session_maker = sessionmaker(bind=db_session.get_bind())

    def attempt(idx: int):
        session = thread_session_maker()
        try:
            with patch("app.services.services.redeem.InviteService") as mock_invite_service:
                service = MagicMock()
                service.invite_email.return_value = (True, "ok", 1, 1, "team")
                mock_invite_service.return_value = service
                ok, *_ = redeem_code(session, code_value, f"user{idx}@example.com")
                results.append(ok)
        finally:
            session.close()

    threads = [__import__("threading").Thread(target=attempt, args=(i,)) for i in range(5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(1 for r in results if r) == 1
    db_session.refresh(redeem_row)
    assert redeem_row.status == models.CodeStatus.used
