"""
ChildAccount的命令服务。

负责ChildAccount的创建、更新、删除等写操作，仅操作Pool数据库。
结合Provider服务实现与ChatGPT API的集成。
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.repositories.mother_repository import MotherRepository
from app.domains.child_account import (
    ChildAccountCreatePayload,
    ChildAccountUpdatePayload,
    ChildAccountSummary,
    ChildAccountAutoPullResult,
    ChildAccountSyncResult,
    ChildAccountStatus,
)
from app import models
from app import provider
from app.security import decrypt_token


class ChildAccountCommandService:
    """ChildAccount的命令服务，负责所有写操作"""

    def __init__(
        self,
        pool_session: Session,
        mother_repository: Optional[MotherRepository] = None,
    ):
        self._session = pool_session
        self._mother_repo = mother_repository or MotherRepository(pool_session)

    def create_child_account(self, payload: ChildAccountCreatePayload) -> ChildAccountSummary:
        """
        创建新的ChildAccount

        Args:
            payload: 创建ChildAccount的请求数据

        Returns:
            ChildAccountSummary: 创建的ChildAccount摘要信息

        Raises:
            ValueError: 当Mother账号不存在或违反唯一约束时
        """
        # 验证Mother账号存在
        mother = self._mother_repo.get(payload.mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {payload.mother_id} 不存在")

        # 检查唯一约束
        existing = self._session.query(models.ChildAccount).filter(
            models.ChildAccount.mother_id == payload.mother_id,
            models.ChildAccount.team_id == payload.team_id,
            models.ChildAccount.email == payload.email,
        ).first()

        if existing:
            raise ValueError(f"子账号已存在: mother_id={payload.mother_id}, team_id={payload.team_id}, email={payload.email}")

        # 创建ChildAccount
        child_account = models.ChildAccount(
            child_id=payload.child_id,
            name=payload.name,
            email=payload.email,
            mother_id=payload.mother_id,
            team_id=payload.team_id,
            team_name=payload.team_name,
            status=payload.status.value,
            member_id=payload.member_id,
        )

        self._session.add(child_account)
        self._session.flush()

        # 返回摘要信息
        return self._build_child_summary(child_account)

    def update_child_account(self, child_id: int, payload: ChildAccountUpdatePayload) -> ChildAccountSummary:
        """
        更新ChildAccount信息

        Args:
            child_id: ChildAccount ID
            payload: 更新数据

        Returns:
            ChildAccountSummary: 更新后的ChildAccount摘要信息

        Raises:
            ValueError: 当ChildAccount不存在时
        """
        child_account = self._session.get(models.ChildAccount, child_id)
        if not child_account:
            raise ValueError(f"ChildAccount {child_id} 不存在")

        # 更新字段
        if payload.name is not None:
            child_account.name = payload.name
        if payload.status is not None:
            child_account.status = payload.status.value
        if payload.team_name is not None:
            child_account.team_name = payload.team_name
        if payload.member_id is not None:
            child_account.member_id = payload.member_id

        child_account.updated_at = datetime.utcnow()
        self._session.commit()

        return self._build_child_summary(child_account)

    def delete_child_account(self, child_id: int, remove_from_provider: bool = True) -> bool:
        """
        删除ChildAccount

        Args:
            child_id: ChildAccount ID
            remove_from_provider: 是否同时从Provider团队中移除成员

        Returns:
            bool: 是否成功删除

        Raises:
            ValueError: 当ChildAccount不存在时
        """
        child_account = self._session.get(models.ChildAccount, child_id)
        if not child_account:
            raise ValueError(f"ChildAccount {child_id} 不存在")

        # 如果需要，从Provider团队中移除成员
        if remove_from_provider and child_account.member_id:
            try:
                mother = self._mother_repo.get(child_account.mother_id)
                if mother and mother.access_token_enc:
                    access_token = decrypt_token(mother.access_token_enc)
                    # 调用Provider API移除成员
                    # 这里需要实现Provider的remove_member调用
                    pass
            except Exception:
                # Provider移除失败不影响本地删除
                pass

        # 删除本地记录
        self._session.delete(child_account)
        self._session.commit()

        return True

    def auto_pull_child_accounts(
        self,
        mother_id: int,
        team_id: Optional[str] = None
    ) -> ChildAccountAutoPullResult:
        """
        自动拉取ChildAccount

        从Provider获取团队成员信息，并创建/更新本地ChildAccount记录。

        Args:
            mother_id: Mother账号ID
            team_id: 指定团队ID，None表示处理所有团队

        Returns:
            ChildAccountAutoPullResult: 拉取结果统计
        """
        mother = self._mother_repo.get(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        if not mother.access_token_enc:
            raise ValueError(f"Mother账号 {mother_id} 缺少访问令牌")

        try:
            access_token = decrypt_token(mother.access_token_enc)
        except Exception:
            raise ValueError(f"Mother账号 {mother_id} 访问令牌解密失败")

        result = ChildAccountAutoPullResult(
            mother_id=mother_id,
            team_id=team_id or "all",
            pulled_count=0,
            updated_count=0,
            skipped_count=0,
            errors=[],
        )

        try:
            # 获取团队成员列表
            if team_id:
                # 获取指定团队的成员
                members = provider.list_members(access_token, team_id)
                teams_to_process = [(team_id, members)]
            else:
                # 获取所有团队的成员
                teams = self._session.query(models.MotherTeam).filter(
                    models.MotherTeam.mother_id == mother_id,
                    models.MotherTeam.is_enabled == True
                ).all()

                teams_to_process = []
                for team in teams:
                    members = provider.list_members(access_token, team.team_id)
                    teams_to_process.append((team.team_id, members))

            # 处理每个团队的成员
            for process_team_id, members in teams_to_process:
                for member in members:
                    try:
                        # 检查是否已存在
                        existing = self._session.query(models.ChildAccount).filter(
                            models.ChildAccount.mother_id == mother_id,
                            models.ChildAccount.team_id == process_team_id,
                            models.ChildAccount.email == member.get('email', ''),
                        ).first()

                        if existing:
                            # 更新现有记录
                            if member.get('name'):
                                existing.name = member['name']
                            if member.get('id'):
                                existing.member_id = member['id']
                            existing.updated_at = datetime.utcnow()
                            result.updated_count += 1
                        else:
                            # 创建新记录
                            child_account = models.ChildAccount(
                                child_id=f"child_{mother_id}_{process_team_id}_{len(members)}",
                                name=member.get('name', 'Unknown'),
                                email=member.get('email', ''),
                                mother_id=mother_id,
                                team_id=process_team_id,
                                team_name=self._get_team_name(mother_id, process_team_id),
                                status='active',
                                member_id=member.get('id'),
                            )
                            self._session.add(child_account)
                            result.pulled_count += 1

                    except Exception as e:
                        result.errors.append(f"处理成员失败 {member.get('email', 'unknown')}: {str(e)}")
                        continue

            self._session.commit()

        except Exception as e:
            result.errors.append(f"拉取过程中发生错误: {str(e)}")
            self._session.rollback()

        return result

    def sync_child_accounts(
        self,
        mother_id: int,
        team_id: str
    ) -> ChildAccountSyncResult:
        """
        同步ChildAccount信息

        同步本地ChildAccount记录与Provider团队的成员信息。

        Args:
            mother_id: Mother账号ID
            team_id: 团队ID

        Returns:
            ChildAccountSyncResult: 同步结果统计
        """
        mother = self._mother_repo.get(mother_id)
        if not mother:
            raise ValueError(f"Mother账号 {mother_id} 不存在")

        result = ChildAccountSyncResult(
            mother_id=mother_id,
            team_id=team_id,
            total_children=0,
            synced_count=0,
            updated_count=0,
            created_count=0,
            errors=[],
        )

        try:
            # 获取本地ChildAccount记录
            local_children = self._session.query(models.ChildAccount).filter(
                models.ChildAccount.mother_id == mother_id,
                models.ChildAccount.team_id == team_id
            ).all()

            result.total_children = len(local_children)

            # 获取Provider团队成员信息
            if mother.access_token_enc:
                access_token = decrypt_token(mother.access_token_enc)
                provider_members = provider.list_members(access_token, team_id)
                provider_members_dict = {m.get('email', ''): m for m in provider_members}
            else:
                provider_members_dict = {}

            # 同步本地记录
            for child in local_children:
                try:
                    provider_member = provider_members_dict.get(child.email)
                    if provider_member:
                        # 更新本地记录
                        if provider_member.get('name') and provider_member['name'] != child.name:
                            child.name = provider_member['name']
                        if provider_member.get('id') and provider_member['id'] != child.member_id:
                            child.member_id = provider_member['id']
                        child.updated_at = datetime.utcnow()
                        result.synced_count += 1
                        if child in self._session.dirty:
                            result.updated_count += 1
                    else:
                        # Provider中找不到对应成员，可能已被移除
                        child.status = 'inactive'
                        result.synced_count += 1

                except Exception as e:
                    result.errors.append(f"同步子账号失败 {child.email}: {str(e)}")
                    continue

            # 检查Provider中有但本地没有的成员
            for email, provider_member in provider_members_dict.items():
                existing = self._session.query(models.ChildAccount).filter(
                    models.ChildAccount.mother_id == mother_id,
                    models.ChildAccount.team_id == team_id,
                    models.ChildAccount.email == email
                ).first()

                if not existing:
                    # 创建新的ChildAccount
                    child_account = models.ChildAccount(
                        child_id=f"child_{mother_id}_{team_id}_{len(provider_members_dict)}",
                        name=provider_member.get('name', 'Unknown'),
                        email=email,
                        mother_id=mother_id,
                        team_id=team_id,
                        team_name=self._get_team_name(mother_id, team_id),
                        status='active',
                        member_id=provider_member.get('id'),
                    )
                    self._session.add(child_account)
                    result.created_count += 1

            self._session.commit()

        except Exception as e:
            result.errors.append(f"同步过程中发生错误: {str(e)}")
            self._session.rollback()

        return result

    def _build_child_summary(self, child_account: models.ChildAccount) -> ChildAccountSummary:
        """构建ChildAccount摘要DTO"""
        mother = self._mother_repo.get(child_account.mother_id)

        return ChildAccountSummary(
            id=child_account.id,
            child_id=child_account.child_id,
            name=child_account.name,
            email=child_account.email,
            mother_id=child_account.mother_id,
            team_id=child_account.team_id,
            team_name=child_account.team_name,
            status=ChildAccountStatus(child_account.status),
            member_id=child_account.member_id,
            created_at=child_account.created_at,
            updated_at=child_account.updated_at,
            mother_name=mother.name if mother else None,
            mother_status=mother.status.value if mother else None,
        )

    def _get_team_name(self, mother_id: int, team_id: str) -> str:
        """获取团队名称"""
        team = self._session.query(models.MotherTeam).filter(
            models.MotherTeam.mother_id == mother_id,
            models.MotherTeam.team_id == team_id
        ).first()
        return team.team_name if team else team_id
