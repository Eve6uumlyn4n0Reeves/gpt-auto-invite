from app import models
from sqlalchemy.orm import Session

def log(db: Session, actor: str, action: str, target_type: str | None = None, target_id: str | None = None, payload_redacted: str | None = None, ip: str | None = None, ua: str | None = None):
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
