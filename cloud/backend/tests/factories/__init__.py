"""
测试数据工厂
使用 factory_boy 创建测试数据
"""
import factory
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy.orm import Session

from app import models

fake = Faker("zh_CN")


class AdminUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """管理员用户工厂"""
    class Meta:
        model = models.AdminUser
        sqlalchemy_session_persistence = "commit"

    username = factory.Sequence(lambda n: f"admin_{n}")
    password_hash = "hashed_password"
    is_active = True
    created_at = factory.LazyFunction(datetime.utcnow)


class RedeemCodeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """兑换码工厂"""
    class Meta:
        model = models.RedeemCode
        sqlalchemy_session_persistence = "commit"

    code_hash = factory.LazyFunction(lambda: fake.sha256())
    batch_id = factory.Faker("bothify", text="batch_#######")
    status = models.CodeStatus.unused
    expires_at = factory.LazyFunction(
        lambda: datetime.utcnow() + timedelta(days=30)
    )
    created_at = factory.LazyFunction(datetime.utcnow)


class MotherAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """母账号工厂"""
    class Meta:
        model = models.MotherAccount
        sqlalchemy_session_persistence = "commit"

    account_id = factory.LazyFunction(lambda: fake.uuid4())
    email = factory.Faker("email")
    name = factory.Faker("name")
    seat_limit = factory.LazyFunction(lambda: fake.random_int(min=1, max=50))
    created_at = factory.LazyFunction(datetime.utcnow)


class MotherTeamFactory(factory.alchemy.SQLAlchemyModelFactory):
    """团队工厂"""
    class Meta:
        model = models.MotherTeam
        sqlalchemy_session_persistence = "commit"

    team_id = factory.LazyFunction(lambda: fake.uuid4())
    name = factory.Faker("company")
    created_at = factory.LazyFunction(datetime.utcnow)


class InviteRequestFactory(factory.alchemy.SQLAlchemyModelFactory):
    """邀请请求工厂"""
    class Meta:
        model = models.InviteRequest
        sqlalchemy_session_persistence = "commit"

    email = factory.Faker("email")
    status = models.InviteStatus.pending
    created_at = factory.LazyFunction(datetime.utcnow)


class SeatAllocationFactory(factory.alchemy.SQLAlchemyModelFactory):
    """座位分配工厂"""
    class Meta:
        model = models.SeatAllocation
        sqlalchemy_session_persistence = "commit"

    status = models.SeatStatus.held
    created_at = factory.LazyFunction(datetime.utcnow)
    expires_at = factory.LazyFunction(
        lambda: datetime.utcnow() + timedelta(hours=24)
    )


class AuditLogFactory(factory.alchemy.SQLAlchemyModelFactory):
    """审计日志工厂"""
    class Meta:
        model = models.AuditLog
        sqlalchemy_session_persistence = "commit"

    action = factory.Faker("word")
    resource_type = factory.Faker("word")
    resource_id = factory.LazyFunction(lambda: fake.uuid4())
    details = factory.LazyFunction(lambda: {"test": "data"})
    created_at = factory.LazyFunction(datetime.utcnow)