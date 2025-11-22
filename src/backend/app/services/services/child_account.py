from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app import models
from app.provider import list_members, delete_member
from app.security import encrypt_token, decrypt_token
from app.repositories.mother_repository import MotherRepository

logger = logging.getLogger(__name__)


class ChildAccountService:
    """子号管理服务（基于 Pool 仓储）。"""

    def __init__(self, mother_repo: MotherRepository):
        self.mother_repo = mother_repo
        self.pool_session = mother_repo.session

    # ------------------------------------------------------------------ #
    # Helpers
    @staticmethod
    def generate_child_name(mother_name: str, team_id: str, sequence: int = 1) -> str:
        email_prefix = mother_name.split("@")[0]
        team_suffix = team_id[-8:] if len(team_id) > 8 else team_id
        return f"{email_prefix}-Child-{team_suffix}-{sequence:03d}"

    @staticmethod
    def generate_child_email(base_email: str, team_id: str, sequence: int = 1) -> str:
        username, domain = base_email.split("@", 1)
        team_suffix = team_id[-8:] if len(team_id) > 8 else team_id
        return f"{username}+child{team_suffix}{sequence:03d}@{domain}"

    @staticmethod
    def generate_child_email_pool(group_name: str, date_str: str, seq: int, domain: str) -> str:
        group_key = re.sub(r"[^a-zA-Z0-9_-]", "-", group_name.strip())
        return f"{group_key}-{date_str}-{seq:03d}@{domain}"

    def _commit(self) -> None:
        try:
            self.mother_repo.commit()
        except Exception:
            self.mother_repo.rollback()
            raise

    # ------------------------------------------------------------------ #
    # CRUD operations
    def create_child_account(
        self,
        mother_id: int,
        team_id: str,
        team_name: str,
        access_token: Optional[str] = None,
    ) -> Optional[models.ChildAccount]:
        try:
            mother = (
                self.pool_session.query(models.MotherAccount)
                .filter(models.MotherAccount.id == mother_id)
                .first()
            )
            if not mother:
                return None

            existing_child = (
                self.pool_session.query(models.ChildAccount)
                .filter(
                    and_(
                        models.ChildAccount.mother_id == mother_id,
                        models.ChildAccount.team_id == team_id,
                    )
                )
                .first()
            )
            if existing_child:
                return existing_child

            existing_count = (
                self.pool_session.query(models.ChildAccount)
                .filter(models.ChildAccount.mother_id == mother_id)
                .count()
            )
            sequence = existing_count + 1
            child = models.ChildAccount(
                child_id=f"child-{uuid.uuid4().hex[:12]}",
                name=self.generate_child_name(mother.name, team_id, sequence),
                email=self.generate_child_email(mother.name, team_id, sequence),
                mother_id=mother_id,
                team_id=team_id,
                team_name=team_name,
                status="active",
                access_token_enc=encrypt_token(access_token) if access_token else None,
            )
            self.pool_session.add(child)
            self._commit()
            self.pool_session.refresh(child)
            return child
        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception("Error creating child account: %s", exc)
            return None

    def auto_pull_children_for_mother(self, mother_id: int) -> List[models.ChildAccount]:
        try:
            mother = (
                self.pool_session.query(models.MotherAccount)
                .filter(models.MotherAccount.id == mother_id)
                .first()
            )
            if not mother or not mother.access_token_enc:
                return []

            access_token = decrypt_token(mother.access_token_enc)
            teams = (
                self.pool_session.query(models.MotherTeam)
                .filter(
                    and_(
                        models.MotherTeam.mother_id == mother_id,
                        models.MotherTeam.is_enabled == True,  # noqa: E712
                    )
                )
                .all()
            )

            created_children: List[models.ChildAccount] = []
            changed = False
            for team in teams:
                try:
                    members = list_members(
                        access_token=access_token,
                        team_id=team.team_id,
                        offset=0,
                        limit=100,
                        query="",
                    )
                except Exception as exc:
                    logger.warning("Failed to pull members for team %s: %s", team.team_id, exc)
                    continue

                for member in (members or {}).get("items", []):
                    if member.get("email") == mother.name:
                        continue

                    child = self.create_child_account(
                        mother_id=mother_id,
                        team_id=team.team_id,
                        team_name=team.team_name or f"Team-{team.team_id[:8]}",
                    )
                    if child:
                        child.member_id = member.get("id")
                        child.name = member.get("name", child.name)
                        child.email = member.get("email", child.email)
                        self.pool_session.add(child)
                        created_children.append(child)
                        changed = True

            if changed:
                self._commit()
            return created_children
        except Exception as exc:
            logger.exception("Error auto pulling children for mother %s", mother_id)
            self.mother_repo.rollback()
            return []

    def sync_child_members(self, mother_id: int) -> Dict[str, Any]:
        try:
            mother = (
                self.pool_session.query(models.MotherAccount)
                .filter(models.MotherAccount.id == mother_id)
                .first()
            )
            if not mother or not mother.access_token_enc:
                return {"success": False, "message": "母号不存在"}

            access_token = decrypt_token(mother.access_token_enc)
            db_children = (
                self.pool_session.query(models.ChildAccount)
                .filter(models.ChildAccount.mother_id == mother_id)
                .all()
            )
            teams = (
                self.pool_session.query(models.MotherTeam)
                .filter(
                    and_(
                        models.MotherTeam.mother_id == mother_id,
                        models.MotherTeam.is_enabled == True,  # noqa: E712
                    )
                )
                .all()
            )

            synced_count = 0
            error_count = 0
            for team in teams:
                try:
                    members = list_members(
                        access_token=access_token,
                        team_id=team.team_id,
                        offset=0,
                        limit=100,
                        query="",
                    )
                except Exception:
                    error_count += 1
                    continue

                for member in (members or {}).get("items", []):
                    child = next(
                        (
                            c
                            for c in db_children
                            if c.team_id == team.team_id
                            and c.email == member.get("email")
                        ),
                        None,
                    )
                    if child:
                        child.name = member.get("name", child.name)
                        child.email = member.get("email", child.email)
                        child.status = "active"
                        self.pool_session.add(child)
                        synced_count += 1

            if synced_count:
                self._commit()

            return {
                "success": True,
                "synced_count": synced_count,
                "error_count": error_count,
                "message": f"成功同步 {synced_count} 个子号",
            }
        except Exception as exc:
            self.mother_repo.rollback()
            return {"success": False, "message": f"同步失败: {exc}"}

    def remove_child_member(self, child_id: int) -> bool:
        try:
            child = (
                self.pool_session.query(models.ChildAccount)
                .filter(models.ChildAccount.id == child_id)
                .first()
            )
            if not child:
                return False

            mother = (
                self.pool_session.query(models.MotherAccount)
                .filter(models.MotherAccount.id == child.mother_id)
                .first()
            )
            if not mother or not mother.access_token_enc:
                return False

            access_token = decrypt_token(mother.access_token_enc)
            try:
                delete_member(access_token, child.team_id, child.member_id)
            except Exception as exc:
                logger.warning("Error removing member from provider team=%s member=%s: %s", child.team_id, child.member_id, exc)

            self.pool_session.delete(child)
            self._commit()
            return True
        except Exception as exc:
            self.mother_repo.rollback()
            logger.exception("Error removing child member child_id=%s", child_id)
            return False

    def get_children_by_mother(self, mother_id: int) -> List[models.ChildAccount]:
        return (
            self.pool_session.query(models.ChildAccount)
            .filter(models.ChildAccount.mother_id == mother_id)
            .order_by(models.ChildAccount.created_at.desc())
            .all()
        )

    def get_child_statistics(self) -> Dict[str, Any]:
        total_children = self.pool_session.query(models.ChildAccount).count()
        active_children = (
            self.pool_session.query(models.ChildAccount)
            .filter(models.ChildAccount.status == "active")
            .count()
        )
        inactive_children = (
            self.pool_session.query(models.ChildAccount)
            .filter(models.ChildAccount.status == "inactive")
            .count()
        )
        suspended_children = (
            self.pool_session.query(models.ChildAccount)
            .filter(models.ChildAccount.status == "suspended")
            .count()
        )

        mother_stats = (
            self.pool_session.query(
                models.ChildAccount.mother_id,
                func.count(models.ChildAccount.id).label("child_count"),
            )
            .group_by(models.ChildAccount.mother_id)
            .all()
        )

        return {
            "total_children": total_children,
            "active_children": active_children,
            "inactive_children": inactive_children,
            "suspended_children": suspended_children,
            "mother_stats": [
                {"mother_id": stat.mother_id, "child_count": stat.child_count}
                for stat in mother_stats
            ],
        }


def create_child_account_service(pool_session: Session) -> ChildAccountService:
    return ChildAccountService(MotherRepository(pool_session))
