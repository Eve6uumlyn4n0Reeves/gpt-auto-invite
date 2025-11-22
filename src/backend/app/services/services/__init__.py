"""
服务层的统一初始化和依赖注入。

提供Mother相关服务的工厂函数，便于在路由中使用依赖注入。
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db_users, get_db_pool
from app.repositories.mother_repository import MotherRepository
from app.repositories.users_repository import UsersRepository
from app.services.services.mother_command import MotherCommandService
from app.services.services.mother_query import MotherQueryService


# Pool域服务依赖
def get_mother_repository(
    pool_db: Session = Depends(get_db_pool),
) -> MotherRepository:
    """获取Mother仓储实例"""
    return MotherRepository(pool_db)


def get_mother_command_service(
    pool_db: Session = Depends(get_db_pool),
    mother_repo: MotherRepository = Depends(get_mother_repository),
) -> MotherCommandService:
    """获取Mother命令服务实例"""
    return MotherCommandService(pool_db, mother_repo)


def get_mother_query_service(
    pool_db: Session = Depends(get_db_pool),
    mother_repo: MotherRepository = Depends(get_mother_repository),
) -> MotherQueryService:
    """获取Mother查询服务实例"""
    return MotherQueryService(pool_db, mother_repo)


# Users域服务依赖
def get_users_repository(
    users_db: Session = Depends(get_db_users),
) -> UsersRepository:
    """获取Users仓储实例"""
    return UsersRepository(users_db)


# 服务组合
class MotherServices:
    """Mother相关服务的组合"""

    def __init__(
        self,
        command: MotherCommandService,
        query: MotherQueryService,
    ):
        self.command = command
        self.query = query


def get_mother_services(
    command: MotherCommandService = Depends(get_mother_command_service),
    query: MotherQueryService = Depends(get_mother_query_service),
) -> MotherServices:
    """获取Mother服务组合"""
    return MotherServices(command, query)
