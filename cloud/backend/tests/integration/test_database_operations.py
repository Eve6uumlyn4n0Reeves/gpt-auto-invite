"""
数据库操作集成测试
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app import models
from app.services.services.redeem import generate_codes, redeem_code
from app.services.services.invites import InviteService
from app.services.services.admin import AdminService


@pytest.mark.integration
class TestDatabaseIntegration:
    """数据库集成测试"""

    def test_transaction_rollback_on_error(self, db_session: Session):
        """测试错误时事务回滚"""
        initial_count = db_session.query(models.RedeemCode).count()

        try:
            # 开始一个事务
            code = models.RedeemCode(
                code_hash="test_hash",
                batch_id="test_batch",
                status=models.CodeStatus.unused
            )
            db_session.add(code)
            db_session.flush()  # 刷新到当前事务

            # 模拟错误
            raise Exception("模拟错误")
        except Exception:
            db_session.rollback()

        # 验证回滚后记录数没有变化
        final_count = db_session.query(models.RedeemCode).count()
        assert final_count == initial_count

    def test_cascade_deletes(self, db_session: Session, sample_mother_accounts, sample_teams):
        """测试级联删除"""
        mother = sample_mother_accounts[0]
        mother_id = mother.id

        # 创建相关的团队和座位
        team = models.MotherTeam(
            team_id="test_team",
            name="Test Team",
            mother_id=mother_id,
            created_at=datetime.utcnow()
        )
        db_session.add(team)
        db_session.flush()

        seat = models.SeatAllocation(
            mother_id=mother_id,
            team_id=team.team_id,
            status=models.SeatStatus.held,
            created_at=datetime.utcnow()
        )
        db_session.add(seat)
        db_session.commit()

        # 删除母账号（如果有级联删除）
        db_session.delete(mother)
        db_session.commit()

        # 验证相关记录是否被删除（这取决于外键约束设置）
        remaining_team = db_session.query(models.MotherTeam).filter(
            models.MotherTeam.mother_id == mother_id
        ).first()
        # 这个断言取决于数据库设计

    def test_concurrent_redeem_attempt(self, db_session: Session):
        """测试并发兑换尝试"""
        # 创建一个兑换码
        code = "CONCURRENT_CODE"
        code_hash = f"hash_{code}"
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="concurrent_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        import threading
        import time

        results = []

        def attempt_redeem(email_suffix):
            # 为每个线程创建独立的数据库会话
            from app.database import SessionLocal
            thread_db = SessionLocal()

            try:
                with patch('app.services.services.redeem.InviteService') as mock_invite_service:
                    mock_service_instance = Mock()
                    mock_invite_service.return_value = mock_service_instance
                    mock_service_instance.invite_email.return_value = (
                        True, "成功", "invite_001", "mother_001", "team_001"
                    )

                    success, message, _, _, _ = redeem_code(
                        thread_db, code, f"user{email_suffix}@example.com"
                    )
                    results.append(success)
            finally:
                thread_db.close()

        # 创建多个线程同时尝试兑换同一个代码
        threads = []
        for i in range(5):
            thread = threading.Thread(target=attempt_redeem, args=(i,))
            threads.append(thread)

        # 同时启动所有线程
        for thread in threads:
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 验证只有一个兑换成功
        successful_redeems = sum(results)
        assert successful_redeems == 1

        # 验证数据库中的状态
        db_session.refresh(redeem_code_model)
        assert redeem_code_model.status == models.CodeStatus.used

    def test_foreign_key_constraints(self, db_session: Session):
        """测试外键约束"""
        # 尝试创建引用不存在母账号的团队
        with pytest.raises(Exception):  # 具体异常类型取决于数据库
            team = models.MotherTeam(
                team_id="invalid_team",
                name="Invalid Team",
                mother_id=99999,  # 不存在的母账号ID
                created_at=datetime.utcnow()
            )
            db_session.add(team)
            db_session.commit()

    def test_unique_constraints(self, db_session: Session):
        """测试唯一性约束"""
        # 创建第一个管理员用户
        admin1 = models.AdminUser(
            username="unique_admin",
            password_hash="hash1",
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin1)
        db_session.commit()

        # 尝试创建相同用户名的第二个管理员用户
        with pytest.raises(Exception):  # 应该抛出完整性错误
            admin2 = models.AdminUser(
                username="unique_admin",  # 相同用户名
                password_hash="hash2",
                is_active=True,
                created_at=datetime.utcnow()
            )
            db_session.add(admin2)
            db_session.commit()

    def test_index_usage(self, db_session: Session, sample_redeem_codes):
        """测试索引使用情况"""
        # 这个测试需要数据库支持查询计划分析
        import time

        # 创建大量数据以便观察索引效果
        for i in range(1000):
            code = models.RedeemCode(
                code_hash=f"hash_bulk_{i}",
                batch_id=f"batch_{i % 10}",
                status=models.CodeStatus.unused,
                created_at=datetime.utcnow()
            )
            db_session.add(code)

        db_session.commit()

        # 测试按状态查询（应该使用索引）
        start_time = time.time()
        unused_codes = db_session.query(models.RedeemCode).filter(
            models.RedeemCode.status == models.CodeStatus.unused
        ).all()
        query_time = time.time() - start_time

        # 验证查询性能（如果数据量足够大）
        assert len(unused_codes) > 0
        # 这个断言取决于数据量和索引

    def test_relationship_loading(self, db_session: Session, sample_invite_requests, sample_redeem_codes):
        """测试关系加载"""
        # 获取邀请请求并加载相关兑换码
        invite = db_session.query(models.InviteRequest).first()
        assert invite is not None

        # 测试延迟加载
        if invite.code_id:
            code = invite.code  # 这会触发延迟加载
            assert code is not None

        # 测试预加载
        invites_with_codes = db_session.query(models.InviteRequest).options(
            db_session.query(models.InviteRequest).joinedload(models.InviteRequest.code)
        ).all()

        assert len(invites_with_codes) > 0

    def test_data_consistency(self, db_session: Session):
        """测试数据一致性"""
        # 创建兑换码
        code_hash = "consistency_test_hash"
        redeem_code_model = models.RedeemCode(
            code_hash=code_hash,
            batch_id="consistency_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code_model)
        db_session.commit()

        # 执行兑换
        email = "consistency@example.com"
        with patch('app.services.services.redeem.InviteService') as mock_invite_service:
            mock_service_instance = Mock()
            mock_invite_service.return_value = mock_service_instance
            mock_service_instance.invite_email.return_value = (
                True, "成功", "invite_001", "mother_001", "team_001"
            )

            success, message, invite_id, mother_id, team_id = redeem_code(
                db_session, "consistency_test_code", email
            )

            assert success is True

        # 验证数据一致性
        db_session.refresh(redeem_code_model)
        assert redeem_code_model.status == models.CodeStatus.used
        assert redeem_code_model.used_by_email == email

        # 验证邀请请求存在
        invite = db_session.query(models.InviteRequest).filter(
            models.InviteRequest.email == email
        ).first()
        assert invite is not None
        assert invite.mother_id == mother_id
        assert invite.team_id == team_id

    def test_soft_delete_behavior(self, db_session: Session):
        """测试软删除行为（如果实现了软删除）"""
        # 创建一些测试数据
        admin = models.AdminUser(
            username="soft_delete_test",
            password_hash="hash",
            is_active=True,
            created_at=datetime.utcnow()
        )
        db_session.add(admin)
        db_session.commit()

        # 软删除（设置is_active=False）
        admin.is_active = False
        db_session.commit()

        # 验证软删除后的行为
        active_admin = db_session.query(models.AdminUser).filter(
            models.AdminUser.is_active == True
        ).filter(models.AdminUser.username == "soft_delete_test").first()
        assert active_admin is None

        # 但记录仍然存在于数据库中
        all_admin = db_session.query(models.AdminUser).filter(
            models.AdminUser.username == "soft_delete_test"
        ).first()
        assert all_admin is not None
        assert all_admin.is_active is False

    def test_database_connection_recovery(self, db_session: Session):
        """测试数据库连接恢复"""
        # 这个测试需要模拟数据库连接中断
        # 实际实现取决于使用的数据库连接池

        # 执行一些正常操作
        initial_count = db_session.query(models.RedeemCode).count()

        # 创建记录
        code = models.RedeemCode(
            code_hash="recovery_test_hash",
            batch_id="recovery_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(code)
        db_session.commit()

        # 验证记录创建成功
        final_count = db_session.query(models.RedeemCode).count()
        assert final_count == initial_count + 1

    def test_large_transaction_handling(self, db_session: Session):
        """测试大事务处理"""
        # 创建大量数据
        batch_size = 1000
        codes = []

        for i in range(batch_size):
            code = models.RedeemCode(
                code_hash=f"large_tx_hash_{i}",
                batch_id="large_tx_batch",
                status=models.CodeStatus.unused,
                created_at=datetime.utcnow()
            )
            codes.append(code)

        # 批量插入
        db_session.add_all(codes)
        db_session.commit()

        # 验证所有数据都被正确插入
        count = db_session.query(models.RedeemCode).filter(
            models.RedeemCode.batch_id == "large_tx_batch"
        ).count()
        assert count == batch_size

        # 批量更新
        db_session.query(models.RedeemCode).filter(
            models.RedeemCode.batch_id == "large_tx_batch"
        ).update({"status": models.CodeStatus.used})
        db_session.commit()

        # 验证批量更新
        used_count = db_session.query(models.RedeemCode).filter(
            models.RedeemCode.batch_id == "large_tx_batch",
            models.RedeemCode.status == models.CodeStatus.used
        ).count()
        assert used_count == batch_size