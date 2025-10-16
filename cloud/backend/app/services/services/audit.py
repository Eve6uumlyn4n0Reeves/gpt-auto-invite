from typing import Optional

from app import models
from sqlalchemy.orm import Session


def log(
    db: Session,
    actor: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    payload_redacted: Optional[str] = None,
    ip: Optional[str] = None,
    ua: Optional[str] = None,
):
    row = models.AuditLog(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload_redacted=payload_redacted,
        ip=ip,
        ua=ua,
    )
    db.add(row)
    db.commit()
