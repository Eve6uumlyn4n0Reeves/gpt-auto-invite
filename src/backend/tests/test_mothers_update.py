from typing import Dict
from fastapi.testclient import TestClient

from app import models
from app.security import encrypt_token


def _login_and_csrf(client: TestClient) -> Dict[str, str]:
    r = client.post("/api/admin/login", json={"password": "admin123"})
    assert r.status_code == 200
    csrf = client.get("/api/admin/csrf-token")
    assert csrf.status_code == 200
    token = csrf.json()["csrf_token"]
    return {"X-CSRF-Token": token, "X-Domain": "pool"}


def test_update_mother_replaces_teams(test_client: TestClient, db_session):
    # Arrange: 一个母号，初始1个团队
    mother = models.MotherAccount(
        name="origin@example.com",
        access_token_enc=encrypt_token("old"),
        seat_limit=2,
        status=models.MotherStatus.active,
    )
    db_session.add(mother)
    db_session.flush()
    db_session.add(
        models.MotherTeam(
            mother_id=mother.id,
            team_id="team-old",
            team_name="Old",
            is_enabled=True,
            is_default=True,
        )
    )
    db_session.commit()

    headers = _login_and_csrf(test_client)

    payload = {
        "name": "updated@example.com",
        "access_token": "new-token-xyz",
        "token_expires_at": None,
        "notes": "updated",
        "teams": [
            {"team_id": "team-x", "team_name": "X", "is_enabled": True, "is_default": True},
            {"team_id": "team-y", "team_name": "Y", "is_enabled": True, "is_default": False},
        ],
    }

    r = test_client.put(f"/api/admin/mothers/{mother.id}", json=payload, headers=headers)
    assert r.status_code == 200

    # 验证已替换团队且只有一个默认
    teams = (
        db_session.query(models.MotherTeam)
        .filter(models.MotherTeam.mother_id == mother.id)
        .order_by(models.MotherTeam.team_id)
        .all()
    )
    assert [t.team_id for t in teams] == ["team-x", "team-y"]
    assert sum(1 for t in teams if t.is_default) == 1
    db_session.refresh(mother)
    assert mother.name == "updated@example.com"
