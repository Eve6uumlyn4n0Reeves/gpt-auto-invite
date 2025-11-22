"""
Data access helpers bound to the Users database.

Provides a narrow interface for managing invite requests, redeem codes,
audit logs, etc., without leaking SQLAlchemy session details to the
service layer.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Iterable, Optional, Sequence

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import models


class UsersRepository:
    """Repository wrapper for entities stored in the Users database."""

    def __init__(self, session: Session) -> None:
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    # Invite requests -------------------------------------------------
    def create_invite_request(
        self,
        *,
        mother_id: Optional[int],
        team_id: str,
        email: str,
        code_id: Optional[int],
        status: models.InviteStatus,
    ) -> models.InviteRequest:
        invite = models.InviteRequest(
            mother_id=mother_id,
            team_id=team_id,
            email=email,
            code_id=code_id,
            status=status,
        )
        self._session.add(invite)
        self._session.flush()
        return invite

    def get_invite_request(self, invite_request_id: int) -> Optional[models.InviteRequest]:
        return self._session.get(models.InviteRequest, invite_request_id)

    def list_invites_for_email(
        self,
        email: str,
        *,
        status: Optional[models.InviteStatus] = None,
    ) -> list[models.InviteRequest]:
        query = self._session.query(models.InviteRequest).filter(
            func.lower(models.InviteRequest.email) == email.lower()
        )
        if status:
            query = query.filter(models.InviteRequest.status == status)
        return query.all()

    def mark_invite_status(
        self,
        invite: models.InviteRequest,
        status: models.InviteStatus,
        *,
        error_code: Optional[str] = None,
        error_msg: Optional[str] = None,
        invite_id: Optional[str] = None,
    ) -> None:
        invite.status = status
        invite.error_code = error_code
        invite.error_msg = error_msg
        if invite_id:
            invite.invite_id = invite_id
        self._session.add(invite)

    # Redeem codes ----------------------------------------------------
    def get_redeem_code_by_hash(self, code_hash: str) -> Optional[models.RedeemCode]:
        return (
            self._session.query(models.RedeemCode)
            .filter(models.RedeemCode.code_hash == code_hash)
            .first()
        )

    def cas_block_redeem_code(self, code_hash: str) -> bool:
        res = self._session.execute(
            update(models.RedeemCode)
            .where(
                models.RedeemCode.code_hash == code_hash,
                models.RedeemCode.status == models.CodeStatus.unused,
            )
            .values(status=models.CodeStatus.blocked)
        )
        return res.rowcount == 1

    def count_active_redeem_codes(self) -> int:
        return (
            self._session.query(func.count(models.RedeemCode.id))
            .filter(models.RedeemCode.active == True)  # noqa: E712
            .scalar()
        ) or 0

    # Code SKUs --------------------------------------------------------
    def list_code_skus(self, include_inactive: bool = False) -> list[models.CodeSku]:
        query = self._session.query(models.CodeSku)
        if not include_inactive:
            query = query.filter(models.CodeSku.is_active == True)  # noqa: E712
        return query.order_by(models.CodeSku.created_at.desc()).all()

    def get_code_sku(self, sku_id: int) -> Optional[models.CodeSku]:
        return self._session.get(models.CodeSku, sku_id)

    def get_code_sku_by_slug(self, slug: str, *, include_inactive: bool = False) -> Optional[models.CodeSku]:
        query = self._session.query(models.CodeSku).filter(
            func.lower(models.CodeSku.slug) == slug.lower()
        )
        if not include_inactive:
            query = query.filter(models.CodeSku.is_active == True)  # noqa: E712
        return query.first()

    def create_code_sku(
        self,
        *,
        name: str,
        slug: str,
        description: Optional[str],
        lifecycle_days: int,
        default_refresh_limit: Optional[int],
        price_cents: Optional[int],
        is_active: bool,
    ) -> models.CodeSku:
        sku = models.CodeSku(
            name=name,
            slug=slug.lower(),
            description=description,
            lifecycle_days=lifecycle_days,
            default_refresh_limit=default_refresh_limit,
            price_cents=price_cents,
            is_active=is_active,
        )
        self._session.add(sku)
        self._session.flush()
        return sku

    def save_code_sku(self, sku: models.CodeSku) -> None:
        self._session.add(sku)

    # Refresh history --------------------------------------------------
    def add_refresh_history(
        self,
        code: models.RedeemCode,
        *,
        event_type: models.CodeRefreshEventType,
        delta_refresh: Optional[int] = None,
        triggered_by: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> models.CodeRefreshHistory:
        record = models.CodeRefreshHistory(
            code=code,
            event_type=event_type,
            delta_refresh=delta_refresh,
            triggered_by=triggered_by,
            metadata_json=json.dumps(metadata or {}),
            created_at=datetime.utcnow(),
        )
        self._session.add(record)
        return record

    # Switch requests --------------------------------------------------
    def get_pending_switch_request(self, code_id: int, email: str) -> Optional[models.SwitchRequest]:
        return (
            self._session.query(models.SwitchRequest)
            .filter(
                models.SwitchRequest.redeem_code_id == code_id,
                func.lower(models.SwitchRequest.email) == email.lower(),
                models.SwitchRequest.status == models.SwitchRequestStatus.pending,
            )
            .first()
        )

    def list_pending_switch_requests(self, limit: int = 50) -> list[models.SwitchRequest]:
        return (
            self._session.query(models.SwitchRequest)
            .filter(models.SwitchRequest.status == models.SwitchRequestStatus.pending)
            .order_by(models.SwitchRequest.queued_at.asc())
            .limit(limit)
            .all()
        )

    # Generic helpers -------------------------------------------------
    def bulk_add(self, entities: Iterable[object]) -> None:
        for entity in entities:
            self._session.add(entity)

    def flush(self) -> None:
        self._session.flush()

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()
