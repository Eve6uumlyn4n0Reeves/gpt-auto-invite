"""
Pool API 端到端测试

测试 Pool API 的完整 HTTP 接口。
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy.orm import Session

from app.models import MotherAccount
from app.models_pool_api import APIKey
from app.services.pool_api_key_service import APIKeyService
from app.security import encrypt_token


class TestPoolAPIEndpoints:
    """测试 Pool API 端点"""
    
    def test_list_members_unauthorized(self, test_client: TestClient):
        """测试未授权访问"""
        response = test_client.get("/pool/teams/ws_123/members")
        assert response.status_code == 401
        data = response.json()
        assert data["ok"] is False
        assert "API_KEY_MISSING" in data["error"]
    
    def test_list_members_invalid_key(self, test_client: TestClient):
        """测试无效的 API Key"""
        response = test_client.get(
            "/pool/teams/ws_123/members",
            headers={"X-API-Key": "pool_invalid_key_123"},
        )
        assert response.status_code == 401
        data = response.json()
        assert data["ok"] is False
    
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_list_members_success(self, mock_list, test_client: TestClient, db_session: Session):
        """测试成功列出成员"""
        # 创建 API Key
        plain_key, api_key_obj = APIKeyService.create_api_key(db_session, name="Test Key")
        
        # 创建母号
        mother = MotherAccount(
            email="test@example.com",
            access_token_enc=encrypt_token("test_token"),
            seat_limit=7,
        )
        db_session.add(mother)
        db_session.flush()
        
        # 创建团队（使用正确的字段名）
        from app.models import MotherTeam
        team = MotherTeam(
            mother_id=mother.id,
            team_id="ws_123",
            workspace_id="ws_123",
            organization_id="org_123",
            team_name="Test Team",
            is_enabled=True,
        )
        db_session.add(team)
        db_session.commit()
        
        # Mock provider 响应
        mock_list.return_value = [
            {"email": "owner@test.com", "role": "owner", "user_id": "u1"},
            {"email": "member1@test.com", "role": "member", "user_id": "u2"},
        ]
        
        # 调用 API
        response = test_client.get(
            "/pool/teams/ws_123/members",
            headers={"X-API-Key": plain_key},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["total"] == 2
        assert len(data["members"]) == 2
    
    @patch('app.services.pool_provider_wrapper.send_invite')
    def test_invite_members_success(self, mock_invite, test_client: TestClient, db_session: Session):
        """测试成功邀请成员"""
        # 创建 API Key
        plain_key, api_key_obj = APIKeyService.create_api_key(db_session, name="Test Key")
        
        # 创建母号和团队
        mother = MotherAccount(
            email="test@example.com",
            access_token_enc=encrypt_token("test_token"),
            seat_limit=7,
        )
        db_session.add(mother)
        db_session.flush()
        
        from app.models import MotherTeam
        team = MotherTeam(
            mother_id=mother.id,
            team_id="ws_123",
            workspace_id="ws_123",
            organization_id="org_123",
            team_name="Test Team",
            is_enabled=True,
        )
        db_session.add(team)
        db_session.commit()
        
        # Mock provider
        mock_invite.return_value = None
        
        # 调用 API
        response = test_client.post(
            "/pool/teams/ws_123/members:invite",
            headers={"X-API-Key": plain_key},
            json={
                "emails": ["new1@test.com", "new2@test.com"],
                "concurrency": 2,
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert len(data["done"]) == 2
        assert data["stats"]["total"] == 2
        assert data["stats"]["succeeded"] == 2
    
    def test_team_not_found(self, test_client: TestClient, db_session: Session):
        """测试团队不存在"""
        # 创建 API Key
        plain_key, _ = APIKeyService.create_api_key(db_session, name="Test Key")
        
        # 调用不存在的团队
        response = test_client.get(
            "/pool/teams/nonexistent_ws/members",
            headers={"X-API-Key": plain_key},
        )
        
        assert response.status_code == 404
    
    @patch('app.services.pool_provider_wrapper.send_invite')
    @patch('app.services.pool_provider_wrapper.delete_member')
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_swap_teams_success(
        self,
        mock_list,
        mock_delete,
        mock_invite,
        test_client: TestClient,
        db_session: Session,
    ):
        """测试成功互换团队"""
        # 创建 API Key
        plain_key, _ = APIKeyService.create_api_key(db_session, name="Test Key")
        
        # 创建两个母号和团队
        mother_a = MotherAccount(
            email="a@example.com",
            access_token_enc=encrypt_token("token_a"),
            seat_limit=7,
        )
        mother_b = MotherAccount(
            email="b@example.com",
            access_token_enc=encrypt_token("token_b"),
            seat_limit=7,
        )
        db_session.add_all([mother_a, mother_b])
        db_session.flush()
        
        from app.models import MotherTeam
        team_a = MotherTeam(
            mother_id=mother_a.id,
            team_id="ws_a",
            workspace_id="ws_a",
            organization_id="org_a",
            team_name="Team A",
            is_enabled=True,
        )
        team_b = MotherTeam(
            mother_id=mother_b.id,
            team_id="ws_b",
            workspace_id="ws_b",
            organization_id="org_b",
            team_name="Team B",
            is_enabled=True,
        )
        db_session.add_all([team_a, team_b])
        db_session.commit()
        
        # Mock provider
        def list_side_effect(token, team_id, *args, **kwargs):
            if team_id == "ws_a":
                return [
                    {"email": "owner_a@test.com", "role": "owner", "user_id": "oa"},
                    {"email": "child_a@test.com", "role": "member", "user_id": "ca"},
                ]
            else:
                return [
                    {"email": "owner_b@test.com", "role": "owner", "user_id": "ob"},
                    {"email": "child_b@test.com", "role": "member", "user_id": "cb"},
                ]
        
        mock_list.side_effect = list_side_effect
        mock_delete.return_value = None
        mock_invite.return_value = None
        
        # 调用 API
        response = test_client.post(
            "/pool/teams:swap",
            headers={"X-API-Key": plain_key},
            json={
                "team_a": {"workspace_id": "ws_a"},
                "team_b": {"workspace_id": "ws_b"},
                "concurrency": 2,
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["stats"]["team_a_kick_total"] == 1
        assert data["stats"]["team_b_kick_total"] == 1
        assert data["stats"]["team_a_invite_total"] == 1
        assert data["stats"]["team_b_invite_total"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

