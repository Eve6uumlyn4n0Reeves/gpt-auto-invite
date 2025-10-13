"""
兑换码服务单元测试
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from sqlalchemy.orm import Session

from app.services.services.redeem import (
    hash_code,
    generate_codes,
    base36,
    redeem_code
)
from app import models


class TestRedeemHelpers:
    """兑换码辅助函数测试"""

    def test_hash_code(self):
        """测试代码哈希"""
        code = "TEST123"
        result = hash_code(code)

        assert isinstance(result, str)
        assert len(result) == 64  # SHA256 长度
        assert result != code
        # 相同输入应产生相同哈希
        assert hash_code(code) == result

    def test_base36(self):
        """测试base36编码"""
        # 测试正常字节
        b = b'\x01\x02\x03'
        result = base36(b)
        assert isinstance(result, str)

        # 测试空字节
        result = base36(b'\x00')
        assert result == "0"

        # 测试大数字
        result = base36(b'\xff' * 16)
        assert isinstance(result, str)

    @patch('app.services.services.redeem.os.urandom')
    def test_generate_codes(self, mock_urandom, db_session: Session):
        """测试生成兑换码"""
        # Mock 随机字节生成
        mock_urandom.return_value = b'\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10'

        batch_id, codes = generate_codes(
            db=db_session,
            count=3,
            prefix="TEST_",
            expires_at=datetime.utcnow() + timedelta(days=30),
            batch_id="custom_batch"
        )

        # 验证批次ID
        assert batch_id == "custom_batch"

        # 验证代码数量
        assert len(codes) == 3

        # 验证代码格式
        for code in codes:
            assert code.startswith("TEST_")
            assert len(code) > 4  # 应该有随机部分

        # 验证数据库中的记录
        db_codes = db_session.query(models.RedeemCode).all()
        assert len(db_codes) == 3

        for db_code in db_codes:
            assert db_code.batch_id == "custom_batch"
            assert db_code.status == models.CodeStatus.unused
            assert db_code.expires_at is not None

    @patch('app.services.services.redeem.os.urandom')
    def test_generate_codes_without_prefix(self, mock_urandom, db_session: Session):
        """测试不带前缀生成兑换码"""
        mock_urandom.return_value = b'\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10'

        batch_id, codes = generate_codes(
            db=db_session,
            count=2,
            prefix=None,
            expires_at=None,
            batch_id=None
        )

        # 验证批次ID自动生成
        assert batch_id is not None
        assert len(batch_id) == 14  # YYYYMMDDHHMMSS 格式

        # 验证代码
        assert len(codes) == 2
        for code in codes:
            assert code is not None
            assert len(code) > 0


class TestRedeemCode:
    """兑换码核心逻辑测试"""

    def test_redeem_code_success_postgresql(self, db_session: Session, sample_redeem_codes):
        """测试成功兑换码 - PostgreSQL方式"""
        code = "VALID_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建测试兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "postgresql"
            mock_bind.dialect = mock_dialect

            # Mock邀请服务
            with patch('app.services.services.redeem.InviteService') as mock_invite_service:
                mock_service_instance = Mock()
                mock_invite_service.return_value = mock_service_instance
                mock_service_instance.invite_email.return_value = (
                    True, "邀请成功", "invite_001", "mother_001", "team_001"
                )

                # 执行兑换
                success, message, invite_id, mother_id, team_id = redeem_code(
                    db_session, code, email
                )

                # 验证结果
                assert success is True
                assert "成功" in message
                assert invite_id == "invite_001"
                assert mother_id == "mother_001"
                assert team_id == "team_001"

                # 验证数据库状态
                db_session.refresh(redeem_code_model)
                assert redeem_code_model.status == models.CodeStatus.used
                assert redeem_code_model.used_by_email == email

    def test_redeem_code_success_non_postgresql(self, db_session: Session):
        """测试成功兑换码 - 非PostgreSQL方式"""
        code = "VALID_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建测试兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock非PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "sqlite"
            mock_bind.dialect = mock_dialect

            # Mock邀请服务
            with patch('app.services.services.redeem.InviteService') as mock_invite_service:
                mock_service_instance = Mock()
                mock_invite_service.return_value = mock_service_instance
                mock_service_instance.invite_email.return_value = (
                    True, "邀请成功", "invite_001", "mother_001", "team_001"
                )

                # 执行兑换
                success, message, invite_id, mother_id, team_id = redeem_code(
                    db_session, code, email
                )

                # 验证结果
                assert success is True
                assert "成功" in message

    def test_redeem_code_invalid(self, db_session: Session):
        """测试无效兑换码"""
        email = "test@example.com"

        # 执行兑换无效代码
        success, message, invite_id, mother_id, team_id = redeem_code(
            db_session, "INVALID_CODE", email
        )

        # 验证结果
        assert success is False
        assert message == "兑换码无效"
        assert invite_id is None
        assert mother_id is None
        assert team_id is None

    def test_redeem_code_already_used(self, db_session: Session):
        """测试已使用的兑换码"""
        code = "USED_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建已使用的兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.used,
            used_by_email="other@example.com"
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "postgresql"
            mock_bind.dialect = mock_dialect

            # 执行兑换
            success, message, invite_id, mother_id, team_id = redeem_code(
                db_session, code, email
            )

            # 验证结果
            assert success is False
            assert "已使用" in message or "不可用" in message

    def test_redeem_code_expired(self, db_session: Session):
        """测试过期兑换码"""
        code = "EXPIRED_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建过期的兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused,
            expires_at=datetime.utcnow() - timedelta(days=1)  # 昨天
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "postgresql"
            mock_bind.dialect = mock_dialect

            # 执行兑换
            success, message, invite_id, mother_id, team_id = redeem_code(
                db_session, code, email
            )

            # 验证结果
            assert success is False
            assert "过期" in message

    def test_redeem_code_invite_failure_rollback(self, db_session: Session):
        """测试邀请失败时的回滚"""
        code = "VALID_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建测试兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "postgresql"
            mock_bind.dialect = mock_dialect

            # Mock邀请服务失败
            with patch('app.services.services.redeem.InviteService') as mock_invite_service:
                mock_service_instance = Mock()
                mock_invite_service.return_value = mock_service_instance
                mock_service_instance.invite_email.return_value = (
                    False, "邀请失败", None, None, None
                )

                # 执行兑换
                success, message, invite_id, mother_id, team_id = redeem_code(
                    db_session, code, email
                )

                # 验证结果
                assert success is False
                assert "失败" in message

                # 验证回滚：兑换码状态应该恢复为未使用
                db_session.refresh(redeem_code_model)
                assert redeem_code_model.status == models.CodeStatus.unused

    def test_redeem_code_exception_handling(self, db_session: Session):
        """测试异常处理"""
        code = "VALID_CODE"
        code_hash = hash_code(code)
        email = "test@example.com"

        # 创建测试兑换码
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # Mock PostgreSQL方言
        with patch('app.services.services.redeem.Session.bind') as mock_bind:
            mock_dialect = Mock()
            mock_dialect.name = "postgresql"
            mock_bind.dialect = mock_dialect

            # Mock邀请服务抛出异常
            with patch('app.services.services.redeem.InviteService') as mock_invite_service:
                mock_service_instance = Mock()
                mock_invite_service.return_value = mock_service_instance
                mock_service_instance.invite_email.side_effect = Exception("测试异常")

                # 执行兑换
                success, message, invite_id, mother_id, team_id = redeem_code(
                    db_session, code, email
                )

                # 验证结果
                assert success is False
                assert "失败" in message or "重试" in message

                # 验证回滚：兑换码状态应该恢复为未使用
                db_session.refresh(redeem_code_model)
                assert redeem_code_model.status == models.CodeStatus.unused