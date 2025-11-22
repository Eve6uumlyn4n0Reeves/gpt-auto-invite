"""
Pool API 集成测试

测试完整的 Pool API 流程，包括数据库操作和服务集成。
"""
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

from app.models import MotherTeam
from app.models_pool_api import APIKey
from app.services.pool_api_key_service import APIKeyService
from app.services.pool_member_service import PoolMemberService, MemberInfo
from app.services.pool_swap_service import PoolSwapService
from app.security import encrypt_token


class TestAPIKeyServiceIntegration:
    """测试 API Key 服务的数据库集成"""
    
    def test_create_and_verify_api_key(self, db_session: Session):
        """测试创建和验证 API Key"""
        # 创建 API Key
        plain_key, api_key_obj = APIKeyService.create_api_key(
            db=db_session,
            name="Test Key",
        )
        
        assert plain_key.startswith("pool_")
        assert api_key_obj.name == "Test Key"
        assert api_key_obj.is_active is True
        assert api_key_obj.key_hash is not None
        
        # 验证 API Key
        verified_key = APIKeyService.get_api_key_by_key(db_session, plain_key)
        assert verified_key is not None
        assert verified_key.id == api_key_obj.id
    
    def test_verify_invalid_key(self, db_session: Session):
        """测试验证无效的 API Key"""
        result = APIKeyService.get_api_key_by_key(db_session, "pool_invalid_key_123")
        assert result is None
    
    def test_disable_api_key(self, db_session: Session):
        """测试禁用 API Key"""
        # 创建 API Key
        plain_key, api_key_obj = APIKeyService.create_api_key(
            db=db_session,
            name="Test Key",
        )
        
        # 禁用
        APIKeyService.disable_api_key(db_session, api_key_obj.id)
        
        # 验证失败
        result = APIKeyService.get_api_key_by_key(db_session, plain_key)
        assert result is None
    
    def test_update_last_used(self, db_session: Session):
        """测试更新最后使用时间"""
        # 创建 API Key
        _, api_key_obj = APIKeyService.create_api_key(
            db=db_session,
            name="Test Key",
        )
        
        assert api_key_obj.last_used_at is None
        
        # 更新最后使用时间
        APIKeyService.update_last_used(db_session, api_key_obj.id)
        
        db_session.refresh(api_key_obj)
        assert api_key_obj.last_used_at is not None


class TestPoolMemberServiceIntegration:
    """测试成员管理服务的集成"""
    
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_list_members(self, mock_list, db_session: Session):
        """测试列出成员"""
        # 创建母号
        mother = MotherTeam(
            workspace_id="ws_123",
            organization_id="org_123",
            name="Test Team",
            access_token_enc=encrypt_token("test_token"),
            is_enabled=True,
        )
        db_session.add(mother)
        db_session.commit()
        
        # Mock provider 响应
        mock_list.return_value = [
            {"email": "user1@test.com", "role": "owner", "user_id": "u1"},
            {"email": "user2@test.com", "role": "member", "user_id": "u2"},
            {"email": "user3@test.com", "role": "member", "user_id": "u3"},
        ]
        
        # 调用服务
        service = PoolMemberService()
        members = service.list_members("ws_123", db=db_session)
        
        assert len(members) == 3
        assert members[0].email == "user1@test.com"
        assert members[0].role == "owner"
    
    @patch('app.services.pool_provider_wrapper.delete_member')
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_kick_members(self, mock_list, mock_delete, db_session: Session):
        """测试踢出成员"""
        # 创建母号
        mother = MotherTeam(
            workspace_id="ws_123",
            organization_id="org_123",
            name="Test Team",
            access_token_enc=encrypt_token("test_token"),
            is_enabled=True,
        )
        db_session.add(mother)
        db_session.commit()
        
        # Mock provider
        mock_list.return_value = [
            {"email": "user1@test.com", "role": "member", "user_id": "u1"},
            {"email": "user2@test.com", "role": "member", "user_id": "u2"},
        ]
        mock_delete.return_value = None
        
        # 准备要踢的成员
        members_to_kick = [
            MemberInfo(email="user1@test.com", role="member", user_id="u1"),
        ]
        
        # 调用服务
        service = PoolMemberService()
        results = service.kick_members("ws_123", members_to_kick, db=db_session)
        
        assert len(results) == 1
        assert results[0].email == "user1@test.com"
        assert results[0].success is True
    
    @patch('app.services.pool_provider_wrapper.send_invite')
    def test_invite_members(self, mock_invite, db_session: Session):
        """测试邀请成员"""
        # 创建母号
        mother = MotherTeam(
            workspace_id="ws_123",
            organization_id="org_123",
            name="Test Team",
            access_token_enc=encrypt_token("test_token"),
            is_enabled=True,
        )
        db_session.add(mother)
        db_session.commit()
        
        # Mock provider
        mock_invite.return_value = None
        
        # 调用服务
        service = PoolMemberService()
        results = service.invite_members(
            "ws_123",
            ["new1@test.com", "new2@test.com"],
            db=db_session,
        )
        
        assert len(results) == 2
        assert all(r.success for r in results)


class TestPoolSwapServiceIntegration:
    """测试互换服务的集成"""
    
    @patch('app.services.pool_provider_wrapper.send_invite')
    @patch('app.services.pool_provider_wrapper.delete_member')
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_swap_teams_success(self, mock_list, mock_delete, mock_invite, db_session: Session):
        """测试成功互换两个团队"""
        # 创建两个母号
        mother_a = MotherTeam(
            workspace_id="ws_a",
            organization_id="org_a",
            name="Team A",
            access_token_enc=encrypt_token("token_a"),
            is_enabled=True,
        )
        mother_b = MotherTeam(
            workspace_id="ws_b",
            organization_id="org_b",
            name="Team B",
            access_token_enc=encrypt_token("token_b"),
            is_enabled=True,
        )
        db_session.add_all([mother_a, mother_b])
        db_session.commit()
        
        # Mock provider 响应
        def list_side_effect(token, team_id, *args, **kwargs):
            if team_id == "ws_a":
                return [
                    {"email": "owner_a@test.com", "role": "owner", "user_id": "oa"},
                    {"email": "child_a1@test.com", "role": "member", "user_id": "ca1"},
                    {"email": "child_a2@test.com", "role": "member", "user_id": "ca2"},
                ]
            else:  # ws_b
                return [
                    {"email": "owner_b@test.com", "role": "owner", "user_id": "ob"},
                    {"email": "child_b1@test.com", "role": "member", "user_id": "cb1"},
                    {"email": "child_b2@test.com", "role": "member", "user_id": "cb2"},
                ]
        
        mock_list.side_effect = list_side_effect
        mock_delete.return_value = None
        mock_invite.return_value = None
        
        # 调用互换服务
        service = PoolSwapService()
        result = service.swap_teams("ws_a", "ws_b", db=db_session)
        
        # 验证结果
        assert result.ok is True
        assert result.stats.team_a_kick_total == 2  # 踢掉 A 的 2 个子号
        assert result.stats.team_b_kick_total == 2  # 踢掉 B 的 2 个子号
        assert result.stats.team_a_invite_total == 2  # A 邀请 B 的 2 个子号
        assert result.stats.team_b_invite_total == 2  # B 邀请 A 的 2 个子号
        
        # 验证调用次数
        # list: 2次（A和B各1次）
        assert mock_list.call_count == 2
        # delete: 4次（A踢2个 + B踢2个）
        assert mock_delete.call_count == 4
        # invite: 4次（A邀请2个 + B邀请2个）
        assert mock_invite.call_count == 4
    
    @patch('app.services.pool_provider_wrapper.list_members')
    def test_swap_teams_no_children(self, mock_list, db_session: Session):
        """测试互换没有子号的团队"""
        # 创建两个母号
        mother_a = MotherTeam(
            workspace_id="ws_a",
            organization_id="org_a",
            name="Team A",
            access_token_enc=encrypt_token("token_a"),
            is_enabled=True,
        )
        mother_b = MotherTeam(
            workspace_id="ws_b",
            organization_id="org_b",
            name="Team B",
            access_token_enc=encrypt_token("token_b"),
            is_enabled=True,
        )
        db_session.add_all([mother_a, mother_b])
        db_session.commit()
        
        # Mock provider 响应 - 只有母号，没有子号
        def list_side_effect(token, team_id, *args, **kwargs):
            if team_id == "ws_a":
                return [{"email": "owner_a@test.com", "role": "owner", "user_id": "oa"}]
            else:
                return [{"email": "owner_b@test.com", "role": "owner", "user_id": "ob"}]
        
        mock_list.side_effect = list_side_effect
        
        # 调用互换服务
        service = PoolSwapService()
        result = service.swap_teams("ws_a", "ws_b", db=db_session)
        
        # 验证结果 - 没有子号，所以所有计数都是0
        assert result.ok is True
        assert result.stats.team_a_kick_total == 0
        assert result.stats.team_b_kick_total == 0
        assert result.stats.team_a_invite_total == 0
        assert result.stats.team_b_invite_total == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

