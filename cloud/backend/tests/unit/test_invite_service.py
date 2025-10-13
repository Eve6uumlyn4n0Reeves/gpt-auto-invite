"""
邀请服务单元测试
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from sqlalchemy.orm import Session

from app.services.services.invites import InviteService
from app import models


class TestInviteService:
    """邀请服务测试"""

    @pytest.fixture
    def invite_service(self, db_session: Session):
        """创建邀请服务实例"""
        return InviteService(db_session)

    def test_invite_email_success(self, invite_service, sample_mother_accounts, sample_teams):
        """测试成功邀请邮件"""
        email = "newuser@example.com"
        code = models.RedeemCode(
            code_hash="test_hash",
            batch_id="test_batch",
            status=models.CodeStatus.used
        )

        # Mock邮件发送
        with patch('app.services.services.invites.email_service') as mock_email:
            mock_email.send_invite_email.return_value = True

            # 执行邀请
            success, message, invite_id, mother_id, team_id = invite_service.invite_email(
                email, code
            )

            # 验证结果
            assert success is True
            assert "成功" in message
            assert invite_id is not None
            assert mother_id is not None
            assert team_id is not None

            # 验证邮件发送被调用
            mock_email.send_invite_email.assert_called_once()

            # 验证数据库记录
            invite = invite_service.db.query(models.InviteRequest).filter(
                models.InviteRequest.email == email
            ).first()
            assert invite is not None
            assert invite.status == models.InviteStatus.pending

    def test_invite_email_duplicate(self, invite_service, db_session: Session):
        """测试重复邮箱邀请"""
        email = "duplicate@example.com"

        # 创建已存在的邀请请求
        existing_invite = models.InviteRequest(
            email=email,
            status=models.InviteStatus.pending,
            created_at=datetime.utcnow()
        )
        db_session.add(existing_invite)
        db_session.commit()

        code = models.RedeemCode(
            code_hash="test_hash",
            batch_id="test_batch",
            status=models.CodeStatus.used
        )

        # 执行邀请
        success, message, invite_id, mother_id, team_id = invite_service.invite_email(
            email, code
        )

        # 验证结果
        assert success is False
        assert "已经存在" in message or "已邀请" in message
        assert invite_id is None

    def test_invite_email_invalid_format(self, invite_service):
        """测试无效邮箱格式"""
        invalid_emails = [
            "invalid-email",
            "@example.com",
            "user@",
            "user..name@example.com",
            ""
        ]

        code = models.RedeemCode(
            code_hash="test_hash",
            batch_id="test_batch",
            status=models.CodeStatus.used
        )

        for invalid_email in invalid_emails:
            success, message, invite_id, mother_id, team_id = invite_service.invite_email(
                invalid_email, code
            )

            assert success is False
            assert "邮箱格式" in message or "无效" in message
            assert invite_id is None

    def test_find_available_mother_account_success(self, invite_service, sample_mother_accounts):
        """测试成功找到可用母账号"""
        # 创建一个有剩余座位的母账号
        mother = sample_mother_accounts[0]
        mother.seat_limit = 5
        invite_service.db.commit()

        # 创建一些已使用的座位
        for i in range(2):  # 使用2个座位
            seat = models.SeatAllocation(
                mother_id=mother.id,
                status=models.SeatStatus.used,
                created_at=datetime.utcnow()
            )
            invite_service.db.add(seat)

        invite_service.db.commit()

        # 查找可用母账号
        available_mother = invite_service._find_available_mother_account()

        assert available_mother is not None
        assert available_mother.id == mother.id

    def test_find_available_mother_account_none_available(self, invite_service, sample_mother_accounts):
        """测试没有可用母账号"""
        # 将所有母账号的座位用满
        for mother in sample_mother_accounts:
            mother.seat_limit = 1
            # 创建一个已使用的座位
            seat = models.SeatAllocation(
                mother_id=mother.id,
                status=models.SeatStatus.used,
                created_at=datetime.utcnow()
            )
            invite_service.db.add(seat)

        invite_service.db.commit()

        # 查找可用母账号
        available_mother = invite_service._find_available_mother_account()

        assert available_mother is None

    def test_find_or_create_team_success(self, invite_service, sample_mother_accounts):
        """测试成功找到或创建团队"""
        mother = sample_mother_accounts[0]

        # 测试创建新团队
        team = invite_service._find_or_create_team(mother.id)
        assert team is not None
        assert team.mother_id == mother.id

        # 测试找到现有团队
        existing_team = invite_service._find_or_create_team(mother.id)
        assert existing_team.id == team.id

    def test_allocate_seat_success(self, invite_service, sample_mother_accounts, sample_teams):
        """测试成功分配座位"""
        mother = sample_mother_accounts[0]
        team = sample_teams[0]

        # 分配座位
        seat = invite_service._allocate_seat(mother.id, team.team_id)

        assert seat is not None
        assert seat.mother_id == mother.id
        assert seat.team_id == team.team_id
        assert seat.status == models.SeatStatus.held
        assert seat.expires_at is not None

    def test_allocate_seat_no_capacity(self, invite_service, sample_mother_accounts, sample_teams):
        """测试无容量时分配座位失败"""
        mother = sample_mother_accounts[0]
        mother.seat_limit = 1
        team = sample_teams[0]

        # 创建一个已使用的座位
        used_seat = models.SeatAllocation(
            mother_id=mother.id,
            status=models.SeatStatus.used,
            created_at=datetime.utcnow()
        )
        invite_service.db.add(used_seat)
        invite_service.db.commit()

        # 尝试分配座位
        seat = invite_service._allocate_seat(mother.id, team.team_id)

        assert seat is None

    def test_create_invite_request_success(self, invite_service, sample_mother_accounts, sample_teams):
        """测试成功创建邀请请求"""
        email = "test@example.com"
        mother = sample_mother_accounts[0]
        team = sample_teams[0]
        code = models.RedeemCode(id=1)

        # 创建邀请请求
        invite = invite_service._create_invite_request(
            email, code.id, mother.id, team.team_id
        )

        assert invite is not None
        assert invite.email == email
        assert invite.code_id == code.id
        assert invite.mother_id == mother.id
        assert invite.team_id == team.team_id
        assert invite.status == models.InviteStatus.pending

    def test_cleanup_expired_holds(self, invite_service, db_session: Session):
        """测试清理过期的座位保留"""
        # 创建过期的座位保留
        expired_seat = models.SeatAllocation(
            mother_id=1,
            status=models.SeatStatus.held,
            created_at=datetime.utcnow() - timedelta(days=2),
            expires_at=datetime.utcnow() - timedelta(days=1)  # 已过期
        )
        db_session.add(expired_seat)

        # 创建未过期的座位保留
        valid_seat = models.SeatAllocation(
            mother_id=1,
            status=models.SeatStatus.held,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=1)  # 未过期
        )
        db_session.add(valid_seat)

        db_session.commit()

        # 执行清理
        cleaned_count = invite_service.cleanup_expired_holds()

        # 验证结果
        assert cleaned_count == 1

        # 验证过期座位被删除
        db_session.refresh(expired_seat)
        assert expired_seat not in db_session

        # 验证有效座位保留
        db_session.refresh(valid_seat)
        assert valid_seat in db_session

    def test_get_invite_statistics(self, invite_service, db_session: Session):
        """测试获取邀请统计"""
        # 创建不同状态的邀请请求
        invites = [
            models.InviteRequest(
                email="user1@example.com",
                status=models.InviteStatus.pending,
                created_at=datetime.utcnow()
            ),
            models.InviteRequest(
                email="user2@example.com",
                status=models.InviteStatus.accepted,
                created_at=datetime.utcnow()
            ),
            models.InviteRequest(
                email="user3@example.com",
                status=models.InviteStatus.accepted,
                created_at=datetime.utcnow()
            )
        ]

        for invite in invites:
            db_session.add(invite)

        db_session.commit()

        # 获取统计
        stats = invite_service.get_invite_statistics()

        assert stats["total"] == 3
        assert stats["pending"] == 1
        assert stats["accepted"] == 2
        assert stats["conversion_rate"] == 2/3  # 66.67%

    @patch('app.services.services.invites.email_service')
    def test_send_invite_email_success(self, mock_email, invite_service):
        """测试发送邀请邮件成功"""
        mock_email.send_invite_email.return_value = True

        result = invite_service._send_invite_email("test@example.com", "INVITE123")

        assert result is True
        mock_email.send_invite_email.assert_called_once_with("test@example.com", "INVITE123")

    @patch('app.services.services.invites.email_service')
    def test_send_invite_email_failure(self, mock_email, invite_service):
        """测试发送邀请邮件失败"""
        mock_email.send_invite_email.return_value = False

        result = invite_service._send_invite_email("test@example.com", "INVITE123")

        assert result is False
        mock_email.send_invite_email.assert_called_once_with("test@example.com", "INVITE123")