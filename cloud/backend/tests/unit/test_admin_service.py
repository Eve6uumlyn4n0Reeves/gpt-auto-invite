"""
管理员服务单元测试
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from sqlalchemy.orm import Session

from app.services.services.admin import AdminService
from app import models
from app.security import hash_password


class TestAdminService:
    """管理员服务测试"""

    @pytest.fixture
    def admin_service(self, db_session: Session):
        """创建管理员服务实例"""
        return AdminService(db_session)

    def test_authenticate_success(self, admin_service, db_session: Session):
        """测试成功认证"""
        username = "testadmin"
        password = "testpass123"
        hashed_password = hash_password(password)

        # 创建管理员用户
        admin = models.AdminUser(
            username=username,
            password_hash=hashed_password,
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 执行认证
        success, message, user = admin_service.authenticate(username, password)

        # 验证结果
        assert success is True
        assert "成功" in message
        assert user is not None
        assert user.username == username

    def test_authenticate_wrong_password(self, admin_service, db_session: Session):
        """测试错误密码认证"""
        username = "testadmin"
        password = "correctpass"
        wrong_password = "wrongpass"
        hashed_password = hash_password(password)

        # 创建管理员用户
        admin = models.AdminUser(
            username=username,
            password_hash=hashed_password,
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 执行认证
        success, message, user = admin_service.authenticate(username, wrong_password)

        # 验证结果
        assert success is False
        assert "密码错误" in message or "失败" in message
        assert user is None

    def test_authenticate_user_not_found(self, admin_service):
        """测试用户不存在认证"""
        success, message, user = admin_service.authenticate("nonexistent", "password")

        # 验证结果
        assert success is False
        assert "用户名或密码" in message or "失败" in message
        assert user is None

    def test_authenticate_inactive_user(self, admin_service, db_session: Session):
        """测试非活跃用户认证"""
        username = "inactiveadmin"
        password = "testpass123"
        hashed_password = hash_password(password)

        # 创建非活跃管理员用户
        admin = models.AdminUser(
            username=username,
            password_hash=hashed_password,
            is_active=False,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 执行认证
        success, message, user = admin_service.authenticate(username, password)

        # 验证结果
        assert success is False
        assert "已禁用" in message or "失败" in message
        assert user is None

    def test_create_admin_success(self, admin_service):
        """测试成功创建管理员"""
        username = "newadmin"
        password = "newpass123"

        # 执行创建
        success, message, user = admin_service.create_admin(username, password)

        # 验证结果
        assert success is True
        assert "成功" in message
        assert user is not None
        assert user.username == username
        assert user.is_active is True

    def test_create_admin_duplicate_username(self, admin_service, db_session: Session):
        """测试创建重复用户名的管理员"""
        username = "duplicateadmin"

        # 创建已存在的管理员
        existing_admin = models.AdminUser(
            username=username,
            password_hash=hash_password("password"),
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(existing_admin)
        db_session.commit()

        # 尝试创建同名管理员
        success, message, user = admin_service.create_admin(username, "newpass123")

        # 验证结果
        assert success is False
        assert "已存在" in message
        assert user is None

    def test_change_password_success(self, admin_service, db_session: Session):
        """测试成功修改密码"""
        username = "admin"
        old_password = "oldpass123"
        new_password = "newpass456"

        # 创建管理员
        admin = models.AdminUser(
            username=username,
            password_hash=hash_password(old_password),
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 修改密码
        success, message = admin_service.change_password(admin.id, old_password, new_password)

        # 验证结果
        assert success is True
        assert "成功" in message

        # 验证密码已更新（通过重新认证）
        auth_success, _, _ = admin_service.authenticate(username, new_password)
        assert auth_success is True

    def test_change_password_wrong_old_password(self, admin_service, db_session: Session):
        """测试旧密码错误时修改密码"""
        username = "admin"
        old_password = "oldpass123"
        wrong_old_password = "wrongpass"
        new_password = "newpass456"

        # 创建管理员
        admin = models.AdminUser(
            username=username,
            password_hash=hash_password(old_password),
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 修改密码
        success, message = admin_service.change_password(
            admin.id, wrong_old_password, new_password
        )

        # 验证结果
        assert success is False
        assert "旧密码错误" in message

    def test_get_admin_statistics(self, admin_service, db_session: Session):
        """测试获取管理员统计"""
        # 创建测试数据
        # 兑换码
        for i in range(10):
            code = models.RedeemCode(
                code_hash=f"hash_{i}",
                batch_id="test_batch",
                status=models.CodeStatus.used if i < 5 else models.CodeStatus.unused,
                used_at=datetime.utcnow() if i < 5 else None
            )
            db_session.add(code)

        # 邀请请求
        for i in range(8):
            invite = models.InviteRequest(
                email=f"user{i}@example.com",
                status=models.InviteStatus.accepted if i < 6 else models.InviteStatus.pending,
                created_at=datetime.utcnow()
            )
            db_session.add(invite)

        # 母账号
        for i in range(3):
            mother = models.MotherAccount(
                account_id=f"mother_{i}",
                email=f"mother{i}@example.com",
                name=f"Mother {i}",
                seat_limit=10,
                created_at=datetime.utcnow()
            )
            db_session.add(mother)

        db_session.commit()

        # 获取统计
        stats = admin_service.get_admin_statistics()

        # 验证结果
        assert stats["total_codes"] == 10
        assert stats["used_codes"] == 5
        assert stats["unused_codes"] == 5
        assert stats["total_invites"] == 8
        assert stats["accepted_invites"] == 6
        assert stats["pending_invites"] == 2
        assert stats["total_mothers"] == 3

    def test_get_recent_activities(self, admin_service, db_session: Session):
        """测试获取最近活动"""
        # 创建不同类型的活动
        activities = [
            models.AuditLog(
                action="create_code",
                resource_type="redeem_code",
                resource_id="code_1",
                details={"batch_id": "batch_001"},
                created_at=datetime.utcnow() - timedelta(hours=1)
            ),
            models.AuditLog(
                action="invite_user",
                resource_type="invite_request",
                resource_id="invite_1",
                details={"email": "user@example.com"},
                created_at=datetime.utcnow() - timedelta(minutes=30)
            ),
            models.AuditLog(
                action="admin_login",
                resource_type="admin_user",
                resource_id="admin_1",
                details={"username": "testadmin"},
                created_at=datetime.utcnow()
            )
        ]

        for activity in activities:
            db_session.add(activity)

        db_session.commit()

        # 获取最近活动
        recent_activities = admin_service.get_recent_activities(limit=10)

        # 验证结果
        assert len(recent_activities) == 3
        # 应该按时间倒序排列
        assert recent_activities[0].action == "admin_login"
        assert recent_activities[1].action == "invite_user"
        assert recent_activities[2].action == "create_code"

    def test_log_activity(self, admin_service, db_session: Session):
        """测试记录活动日志"""
        action = "test_action"
        resource_type = "test_resource"
        resource_id = "test_123"
        details = {"key": "value"}

        # 记录活动
        admin_service.log_activity(action, resource_type, resource_id, details)

        # 验证日志记录
        log = db_session.query(models.AuditLog).filter(
            models.AuditLog.action == action
        ).first()

        assert log is not None
        assert log.action == action
        assert log.resource_type == resource_type
        assert log.resource_id == resource_id
        assert log.details == details

    def test_search_codes(self, admin_service, db_session: Session):
        """测试搜索兑换码"""
        # 创建测试兑换码
        codes = [
            models.RedeemCode(
                code_hash="hash_abc",
                batch_id="batch_search_1",
                status=models.CodeStatus.used,
                used_by_email="found@example.com",
                created_at=datetime.utcnow()
            ),
            models.RedeemCode(
                code_hash="hash_xyz",
                batch_id="batch_other",
                status=models.CodeStatus.unused,
                created_at=datetime.utcnow()
            )
        ]

        for code in codes:
            db_session.add(code)

        db_session.commit()

        # 搜索包含特定批次ID的兑换码
        results = admin_service.search_codes(batch_id="search")

        # 验证结果
        assert len(results) == 1
        assert results[0].batch_id == "batch_search_1"

        # 搜索特定邮箱的兑换码
        results = admin_service.search_codes(email="found@example.com")

        # 验证结果
        assert len(results) == 1
        assert results[0].used_by_email == "found@example.com"

    def test_search_invites(self, admin_service, db_session: Session):
        """测试搜索邀请请求"""
        # 创建测试邀请请求
        invites = [
            models.InviteRequest(
                email="search@example.com",
                status=models.InviteStatus.pending,
                created_at=datetime.utcnow()
            ),
            models.InviteRequest(
                email="other@example.com",
                status=models.InviteStatus.accepted,
                created_at=datetime.utcnow()
            )
        ]

        for invite in invites:
            db_session.add(invite)

        db_session.commit()

        # 搜索特定状态的邀请
        results = admin_service.search_invites(status="pending")

        # 验证结果
        assert len(results) == 1
        assert results[0].status == models.InviteStatus.pending
        assert results[0].email == "search@example.com"

    def test_export_data_csv(self, admin_service, db_session: Session):
        """测试导出CSV数据"""
        # 创建测试数据
        invites = [
            models.InviteRequest(
                email="export1@example.com",
                status=models.InviteStatus.accepted,
                created_at=datetime.utcnow()
            ),
            models.InviteRequest(
                email="export2@example.com",
                status=models.InviteStatus.pending,
                created_at=datetime.utcnow()
            )
        ]

        for invite in invites:
            db_session.add(invite)

        db_session.commit()

        # 导出数据
        csv_data = admin_service.export_data("invites", format="csv")

        # 验证结果
        assert isinstance(csv_data, str)
        assert "email" in csv_data
        assert "status" in csv_data
        assert "export1@example.com" in csv_data
        assert "export2@example.com" in csv_data

    def test_export_data_json(self, admin_service, db_session: Session):
        """测试导出JSON数据"""
        # 创建测试数据
        invites = [
            models.InviteRequest(
                email="json@example.com",
                status=models.InviteStatus.accepted,
                created_at=datetime.utcnow()
            )
        ]

        for invite in invites:
            db_session.add(invite)

        db_session.commit()

        # 导出数据
        json_data = admin_service.export_data("invites", format="json")

        # 验证结果
        import json
        data = json.loads(json_data)
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["email"] == "json@example.com"