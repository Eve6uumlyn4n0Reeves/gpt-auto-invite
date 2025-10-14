from __future__ import annotations

import json
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app import models


def record_bulk_operation(
    db: Session,
    *,
    operation_type: models.BulkOperationType,
    actor: str,
    total_count: Optional[int] = None,
    success_count: Optional[int] = None,
    failed_count: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Save a bulk operation record for later auditing."""
    log = models.BulkOperationLog(
        operation_type=operation_type,
        actor=actor,
        total_count=total_count,
        success_count=success_count,
        failed_count=failed_count,
        metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
    )
    db.add(log)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
