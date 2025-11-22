from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple

from app import models
from app.config import settings
from app.repositories import UsersRepository
from app.repositories.mother_repository import MotherRepository
from app.services.services.redeem import hash_code
from app.services.services.switch import SwitchService


class CodeRefreshService:
    """Handles refresh/rebind operations for redeem codes."""

    def __init__(self, users_repo: UsersRepository, mother_repo: MotherRepository):
        self.users_repo = users_repo
        self.mother_repo = mother_repo
        self.switch_service = SwitchService(users_repo, mother_repo)

    def refresh(
        self,
        *,
        code_plain: str,
        email: str,
        new_email: Optional[str] = None,
    ) -> Tuple[bool, str, dict]:
        code_value = code_plain.strip().upper()
        email_norm = email.strip().lower()
        new_email_norm = new_email.strip().lower() if new_email else None
        code = (
            self.users_repo.session.query(models.RedeemCode)
            .filter(models.RedeemCode.code_hash == hash_code(code_value))
            .first()
        )
        if not code:
            return False, "兑换码不存在", {}
        if code.active is False or code.status != models.CodeStatus.used:
            return False, "兑换码尚未激活或已停用", {}
        bound_email = (code.bound_email or code.used_by_email or "").lower()
        if bound_email and bound_email != email_norm:
            return False, "邮箱与绑定信息不匹配", {}

        limit = code.refresh_limit
        used = code.refresh_used or 0
        remaining = None if limit is None else max(limit - used, 0)
        if limit is not None and used >= limit:
            return False, "刷新次数已用尽", {"refresh_remaining": 0}

        now = datetime.utcnow()
        if code.refresh_cooldown_until and code.refresh_cooldown_until > now:
            cooldown = int((code.refresh_cooldown_until - now).total_seconds())
            return False, "刷新冷却中，请稍后再试", {"cooldown_seconds": max(1, cooldown)}

        target_email = new_email_norm or email_norm
        result = self.switch_service.switch_email(
            target_email,
            code_plain=code_value,
            prefer_recent_team=True,
            recent_window_days=settings.code_refresh_recent_team_days,
        )
        if not result.success:
            payload = {}
            if result.queued:
                payload["queued"] = True
            return False, result.message, payload

        code.refresh_used = used + 1
        code.last_refresh_at = now
        code.refresh_cooldown_until = now + timedelta(seconds=settings.code_refresh_cooldown_seconds)
        code.bound_email = target_email
        code.bound_at = code.bound_at or now
        code.used_by_email = target_email
        code.current_team_id = result.team_id
        code.current_team_assigned_at = now
        self.users_repo.add_refresh_history(
            code,
            event_type=models.CodeRefreshEventType.refresh,
            delta_refresh=1,
            triggered_by=target_email,
            metadata={"team_id": result.team_id},
        )
        self.users_repo.session.add(code)
        self.users_repo.commit()

        remaining_after = None if limit is None else max(limit - code.refresh_used, 0)
        return True, "刷新成功", {
            "refresh_remaining": remaining_after,
            "cooldown_seconds": settings.code_refresh_cooldown_seconds,
            "team_id": result.team_id,
        }

