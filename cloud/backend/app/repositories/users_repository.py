"""
Data access helpers bound to the Users database.

Provides a narrow interface for managing invite requests, redeem codes,
audit logs, etc., without leaking SQLAlchemy session details to the
service layer.
"""

from __future__ import annotations

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
