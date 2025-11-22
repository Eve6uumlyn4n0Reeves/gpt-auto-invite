"""
母号自动化录入服务

实现从浏览器Cookie到完整母号+子号录入的自动化流程：
1. Cookie解析 → 获取母号信息
2. 分组选择 → 关联到号池组
3. Team重命名 → 按规则自动命名
4. 子号拉取 → 自动获取并记录所有子号
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app import models
from app.provider import (
    fetch_session_via_cookie,
    list_members,
    list_teams,
    update_team_info,
    list_invites,
)
from app.security import encrypt_token, decrypt_token
from app.services.services.team_naming import TeamNamingService
from app.services.services.child_account import ChildAccountService
from app.repositories.mother_repository import MotherRepository
from app.utils.tx import atomic

logger = logging.getLogger(__name__)


class AutoMotherIngestService:
    """母号自动化录入服务"""

    def __init__(self, pool_db: Session):
        self.pool_db = pool_db
        self.child_service = ChildAccountService(MotherRepository(pool_db))  # 复用现有子号服务

    def ingest_from_cookie(
        self,
        cookie_string: str,
        pool_group_id: Optional[int] = None,
        pool_group_name: Optional[str] = None
    ) -> Dict:
        """
        从Cookie自动化录入母号（简化版）

        专注于母号创建和team关联，不处理复杂的子号拉取和重命名

        Args:
            cookie_string: 浏览器Cookie字符串
            pool_group_id: 现有号池组ID（可选）
            pool_group_name: 新建号池组名称（可选）

        Returns:
            dict: 录入结果详情
        """
        try:
            # 1. 解析Cookie获取母号信息
            mother_info = self._parse_cookie(cookie_string)

            # 2. 处理号池组分配
            pool_group = self._resolve_pool_group(pool_group_id, pool_group_name)

            # 3. 创建或更新母号记录
            mother = self._create_or_update_mother(mother_info, pool_group.id if pool_group else None)

            # 4. 创建当前Team记录
            team = self._create_team_record(mother, mother_info["account_id"])

            # 5. 返回结果
            return {
                "success": True,
                "mother": {
                    "id": mother.id,
                    "name": mother.name,
                    "email": mother_info["email"],
                    "team_id": mother_info["account_id"],
                    "pool_group_id": pool_group.id if pool_group else None,
                    "pool_group_name": pool_group.name if pool_group else None
                },
                "team": {
                    "team_id": mother_info["account_id"],
                    "team_name": team.team_name if team else None,
                    "is_enabled": team.is_enabled if team else True,
                    "is_default": team.is_default if team else True
                },
                "processed_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"母号自动化录入失败: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }

    def _parse_cookie(self, cookie_string: str) -> Dict:
        """解析Cookie获取母号基础信息"""
        try:
            access_token, expires_at, email, account_id = fetch_session_via_cookie(cookie_string)

            return {
                "access_token": access_token,
                "expires_at": expires_at,
                "email": email,
                "account_id": account_id,
                "cookie_processed_at": datetime.utcnow()
            }
        except Exception as e:
            raise ValueError(f"Cookie解析失败: {str(e)}")

    def _resolve_pool_group(
        self,
        pool_group_id: Optional[int],
        pool_group_name: Optional[str]
    ) -> Optional[models.PoolGroup]:
        """解析号池组分配"""
        # 优先使用现有号池组
        if pool_group_id:
            pool_group = self.pool_db.query(models.PoolGroup).filter(
                models.PoolGroup.id == pool_group_id,
                models.PoolGroup.is_active == True
            ).first()
            if not pool_group:
                raise ValueError(f"号池组 {pool_group_id} 不存在或未激活")
            return pool_group

        # 创建新号池组
        if pool_group_name:
            from app.services.services.pool_group import create_pool_group
            return create_pool_group(
                self.pool_db,
                name=pool_group_name,
                description=f"通过Cookie自动创建: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
            )

        # 不指定号池组
        return None

    def _create_or_update_mother(
        self,
        mother_info: Dict,
        pool_group_id: Optional[int]
    ) -> models.MotherAccount:
        """创建或更新母号记录"""
        # 检查是否已存在（基于邮箱）
        existing = self.pool_db.query(models.MotherAccount).filter(
            models.MotherAccount.name == mother_info["email"]
        ).first()

        if existing:
            # 更新现有记录
            existing.access_token_enc = encrypt_token(mother_info["access_token"])
            existing.token_expires_at = mother_info["expires_at"]
            existing.pool_group_id = pool_group_id
            existing.updated_at = datetime.utcnow()
            if existing.status == models.MotherStatus.invalid:
                existing.status = models.MotherStatus.active

            with atomic(self.pool_db):
                self.pool_db.add(existing)
            self.pool_db.refresh(existing)
            logger.info(f"更新现有母号: {existing.name}")
            return existing

        else:
            # 创建新记录
            mother = models.MotherAccount(
                name=mother_info["email"],
                access_token_enc=encrypt_token(mother_info["access_token"]),
                token_expires_at=mother_info["expires_at"],
                status=models.MotherStatus.active,
                seat_limit=7,
                pool_group_id=pool_group_id,
                notes=f"通过Cookie自动录入: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
            )

            with atomic(self.pool_db):
                self.pool_db.add(mother)
            self.pool_db.refresh(mother)

            logger.info(f"创建新母号: {mother.name}")
            return mother

    def _create_team_record(self, mother: models.MotherAccount, team_id: str) -> Optional[models.MotherTeam]:
        """创建Team记录"""
        try:
            # 检查是否已存在
            existing = self.pool_db.query(models.MotherTeam).filter(
                models.MotherTeam.mother_id == mother.id,
                models.MotherTeam.team_id == team_id
            ).first()

            if existing:
                logger.info(f"Team记录已存在: {team_id}")
                return existing

            # 创建新的team记录
            team = models.MotherTeam(
                mother_id=mother.id,
                team_id=team_id,
                team_name=f"Team-{team_id[:8]}...",  # 临时名称，可以后续修改
                is_enabled=True,
                is_default=True,  # 单team情况设为默认
                created_at=datetime.utcnow()
            )

            with atomic(self.pool_db):
                self.pool_db.add(team)
            self.pool_db.refresh(team)

            logger.info(f"创建新Team记录: {team_id}")
            return team

        except Exception as e:
            logger.error(f"创建Team记录失败: {str(e)}")
            return None

    def _fetch_teams(self, access_token: str, account_id: Optional[str] = None) -> List[Dict]:
        """获取母号下的所有Teams"""
        try:
            if not account_id:
                logger.warning("缺少 account_id，无法拉取Team列表")
                return []

            teams: List[Dict] = []
            cursor: Optional[str] = None
            while True:
                payload = list_teams(access_token, account_id, cursor=cursor, limit=50)
                raw_items = []
                if isinstance(payload, dict):
                    raw_items = (
                        payload.get("teams")
                        or payload.get("items")
                        or payload.get("data")
                        or []
                    )
                for item in raw_items:
                    team_id = item.get("team_id") or item.get("id")
                    if not team_id:
                        continue
                    teams.append(
                        {
                            "team_id": team_id,
                            "team_name": item.get("team_name") or item.get("name"),
                            "is_default": bool(item.get("is_default", False)),
                        }
                    )
                cursor = None
                if isinstance(payload, dict):
                    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
                    if isinstance(meta, dict):
                        cursor = meta.get("next_cursor") or meta.get("cursor")
                    cursor = (
                        cursor
                        or payload.get("next_cursor")
                        or payload.get("next")
                        or payload.get("cursor")
                    )
                if not cursor or not raw_items:
                    break

            logger.info("成功拉取 %d 个Team记录", len(teams))
            return teams
        except Exception as e:
            logger.warning(f"获取Teams失败: {str(e)}")
            return []

    def _auto_rename_teams(
        self,
        mother: models.MotherAccount,
        teams: List[Dict],
        pool_group: Optional[models.PoolGroup],
        custom_template: Optional[str]
    ) -> List[Dict]:
        """自动重命名Teams"""
        renamed = []

        if not pool_group:
            logger.warning("未指定号池组，跳过Team重命名")
            return renamed

        # 获取号池组的命名设置
        settings = get_pool_group_settings(self.pool_db, pool_group.id)
        if not settings:
            logger.warning(f"号池组 {pool_group.name} 未配置命名设置")
            return renamed

        template = custom_template or settings.team_template
        if not template:
            logger.warning("未配置Team命名模板")
            return renamed

        for team in teams:
            try:
                # 生成新的team名称
                new_name = TeamNamingService.generate_team_name(
                    template,
                    pool_group.name,
                    team["team_id"]
                )

                # 调用API更新team名称
                result = update_team_info(
                    decrypt_token(mother.access_token_enc),  # 解密token
                    team["team_id"],
                    new_name
                )

                if result.get("ok"):
                    # 更新本地记录
                    local_team = self.pool_db.query(models.MotherTeam).filter(
                        models.MotherTeam.mother_id == mother.id,
                        models.MotherTeam.team_id == team["team_id"]
                    ).first()

                    if local_team:
                        local_team.team_name = new_name
                        with atomic(self.pool_db):
                            self.pool_db.add(local_team)

                    renamed.append({
                        "team_id": team["team_id"],
                        "old_name": team.get("name", ""),
                        "new_name": new_name,
                        "success": True
                    })
                else:
                    renamed.append({
                        "team_id": team["team_id"],
                        "old_name": team.get("name", ""),
                        "new_name": new_name,
                        "success": False,
                        "error": "API调用失败"
                    })

            except Exception as e:
                logger.error(f"重命名Team失败 {team['team_id']}: {str(e)}")
                renamed.append({
                    "team_id": team["team_id"],
                    "old_name": team.get("name", ""),
                    "new_name": "",
                    "success": False,
                    "error": str(e)
                })

        return renamed

    def _auto_pull_children(
        self,
        mother: models.MotherAccount,
        teams: List[Dict],
        pool_group: Optional[models.PoolGroup],
        custom_template: Optional[str]
    ) -> Dict:
        """自动拉取子号"""
        result = {"total": 0, "created": 0, "updated": 0}

        if not teams:
            return result

        try:
            # 解密access_token
            access_token = decrypt_token(mother.access_token_enc)

            for team in teams:
                try:
                    # 获取团队成员
                    members_response = list_members(access_token, team["team_id"])
                    members = members_response.get("data", [])

                    result["total"] += len(members)

                    # 为每个成员创建或更新子号记录
                    for member in members:
                        child_result = self._create_or_update_child(
                            mother, team, member, pool_group, custom_template
                        )
                        if child_result["created"]:
                            result["created"] += 1
                        else:
                            result["updated"] += 1

                except Exception as e:
                    logger.error(f"拉取Team {team['team_id']} 子号失败: {str(e)}")
                    continue

        except Exception as e:
            logger.error(f"解密access_token失败: {str(e)}")

        return result

    def _create_or_update_child(
        self,
        mother: models.MotherAccount,
        team: Dict,
        member: Dict,
        pool_group: Optional[models.PoolGroup],
        custom_template: Optional[str]
    ) -> Dict:
        """创建或更新子号记录"""
        member_id = member.get("id")
        member_email = member.get("email")
        member_name = member.get("name", "")

        if not member_id or not member_email:
            return {"created": False, "error": "成员信息不完整"}

        # 检查是否已存在
        existing = self.pool_db.query(models.ChildAccount).filter(
            models.ChildAccount.mother_id == mother.id,
            models.ChildAccount.team_id == team["team_id"],
            models.ChildAccount.member_id == member_id
        ).first()

        if existing:
            # 更新现有记录
            existing.name = member_name
            existing.email = member_email
            existing.status = "active"
            existing.updated_at = datetime.utcnow()
            with atomic(self.pool_db):
                self.pool_db.add(existing)
            return {"created": False, "updated": True}

        else:
            # 生成子号名称
            child_name = self._generate_child_name(
                mother.name, team["team_id"], member_name, pool_group, custom_template
            )

            # 创建新记录
            child = models.ChildAccount(
                child_id=f"child_{mother.id}_{team['team_id']}_{member_id}",
                name=child_name,
                email=member_email,
                mother_id=mother.id,
                team_id=team["team_id"],
                team_name=team.get("name", ""),
                status="active",
                member_id=member_id,
                created_at=datetime.utcnow()
            )

            with atomic(self.pool_db):
                self.pool_db.add(child)

            return {"created": True, "updated": False}

    def _generate_child_name(
        self,
        mother_name: str,
        team_id: str,
        member_name: str,
        pool_group: Optional[models.PoolGroup],
        custom_template: Optional[str]
    ) -> str:
        """生成子号名称"""
        if custom_template:
            # 使用自定义模板
            return custom_template.format(
                mother_name=mother_name,
                team_id=team_id,
                member_name=member_name,
                date=datetime.utcnow().strftime("%Y%m%d")
            )

        elif pool_group:
            # 使用号池组设置
            settings = get_pool_group_settings(self.pool_db, pool_group.id)
            if settings and settings.child_name_template:
                return settings.child_name_template.format(
                    group_name=pool_group.name,
                    team_id=team_id,
                    member_name=member_name,
                    date=datetime.utcnow().strftime("%Y%m%d")
                )

        # 默认命名逻辑
        return f"{mother_name.split('@')[0]}-{member_name}-{team_id[:8]}"


def create_auto_mother_ingest_service(pool_db: Session) -> AutoMotherIngestService:
    """创建自动化母号录入服务实例"""
    return AutoMotherIngestService(pool_db)
