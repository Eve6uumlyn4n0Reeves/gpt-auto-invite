from typing import Any, Dict

from fastapi.testclient import TestClient
from unittest.mock import patch

from app import models
from app.security import encrypt_token


def _login_and_csrf(client: TestClient) -> Dict[str, str]:
  # 登录获取 admin_session cookie
  resp = client.post("/api/admin/login", json={"password": "admin123"})
  assert resp.status_code == 200
  # 获取 CSRF
  csrf = client.get("/api/admin/csrf-token")
  assert csrf.status_code == 200
  token = csrf.json()["csrf_token"]
  return {"X-CSRF-Token": token, "X-Domain": "pool"}


def test_list_children_empty_then_with_one(test_client: TestClient, db_session):
  # Arrange: 准备一个母号与其子号
  mother = models.MotherAccount(name="mother@example.com", access_token_enc="enc", seat_limit=3, status=models.MotherStatus.active)
  db_session.add(mother)
  db_session.flush()
  db_session.add(models.MotherTeam(mother_id=mother.id, team_id="team-001", team_name="T1", is_enabled=True, is_default=True))
  db_session.commit()

  # 初始为空
  r0 = test_client.get(f"/api/admin/mothers/{mother.id}/children")
  assert r0.status_code == 200
  assert r0.json().get("items") == []

  # 插入一个子号
  child = models.ChildAccount(
      child_id="child-aaa",
      name="child-1",
      email="child1@example.com",
      mother_id=mother.id,
      team_id="team-001",
      team_name="T1",
      status="active",
  )
  db_session.add(child)
  db_session.commit()

  r1 = test_client.get(f"/api/admin/mothers/{mother.id}/children")
  assert r1.status_code == 200
  items = r1.json().get("items") or []
  assert len(items) == 1
  assert items[0]["email"] == "child1@example.com"


def test_children_auto_pull_and_sync(test_client: TestClient, db_session):
  # Arrange mother with team and valid token
  mother = models.MotherAccount(name="mother2@example.com", access_token_enc=encrypt_token("token-xyz"), seat_limit=2, status=models.MotherStatus.active)
  db_session.add(mother)
  db_session.flush()
  db_session.add(models.MotherTeam(mother_id=mother.id, team_id="team-002", team_name="T2", is_enabled=True, is_default=True))
  db_session.commit()

  headers = _login_and_csrf(test_client)

  # Stub provider list_members via service-level import
  with patch("app.services.services.child_account.list_members", return_value={"items": [
      {"id": "prov-1", "email": "child2@example.com", "name": "Child 2"},
  ]}):
    r = test_client.post(f"/api/admin/mothers/{mother.id}/children/auto-pull", headers=headers, json={})
    assert r.status_code == 200
    assert r.json().get("ok") is True

  # sync should succeed even if provider returns the same member
  with patch("app.services.services.child_account.list_members", return_value={"items": [
      {"id": "prov-1", "email": "child2@example.com", "name": "Child 2"},
  ]}):
    r2 = test_client.post(f"/api/admin/mothers/{mother.id}/children/sync", headers=headers, json={})
    assert r2.status_code == 200
    assert r2.json().get("ok") is True

  # Remove child
  # 查出任意一个子号
  child = db_session.query(models.ChildAccount).filter(models.ChildAccount.mother_id == mother.id).first()
  assert child is not None
  with patch("app.services.services.child_account.delete_member", return_value={"ok": True}):
    r3 = test_client.delete(f"/api/admin/children/{child.id}", headers=headers)
    assert r3.status_code == 200
    assert r3.json().get("ok") is True


def test_children_auto_pull_without_token_returns_400(test_client: TestClient, db_session):
  # Arrange: 母号无 token
  mother = models.MotherAccount(name="mother-no-token@example.com", access_token_enc="", seat_limit=1, status=models.MotherStatus.active)
  db_session.add(mother)
  db_session.flush()
  db_session.add(models.MotherTeam(mother_id=mother.id, team_id="t-no", team_name="T", is_enabled=True, is_default=True))
  db_session.commit()

  headers = _login_and_csrf(test_client)
  r = test_client.post(f"/api/admin/mothers/{mother.id}/children/auto-pull", headers=headers, json={})
  assert r.status_code == 400
  assert 'access_token' in (r.json().get('detail') or '')
