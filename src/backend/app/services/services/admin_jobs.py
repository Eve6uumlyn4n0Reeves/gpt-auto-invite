from __future__ import annotations

from typing import Optional, Tuple, List

from sqlalchemy.orm import Session
from app import models


def _serialize_job(job: models.BatchJob) -> dict:
    return {
        "id": job.id,
        "job_type": job.job_type.value if job.job_type else None,
        "status": job.status.value if job.status else None,
        "actor": job.actor,
        "total_count": job.total_count,
        "success_count": job.success_count,
        "failed_count": job.failed_count,
        "last_error": job.last_error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "payload": job.payload_json,
        "visible_until": job.visible_until.isoformat() if job.visible_until else None,
        "attempts": job.attempts,
    }


def list_jobs(
    session: Session,
    *,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[dict], dict]:
    query = session.query(models.BatchJob)
    if status:
        try:
            status_enum = models.BatchJobStatus(status)
        except ValueError as exc:
            raise ValueError("invalid status") from exc
        query = query.filter(models.BatchJob.status == status_enum)

    total = query.count()
    if total == 0:
        return [], {"page": page, "page_size": page_size, "total": 0, "total_pages": 0}

    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = max(1, min(page, total_pages))
    rows = (
        query.order_by(models.BatchJob.created_at.desc())
        .offset((current_page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [_serialize_job(job) for job in rows], {
        "page": current_page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


def get_job(session: Session, job_id: int) -> dict:
    job = session.get(models.BatchJob, job_id)
    if not job:
        raise ValueError("job not found")
    return _serialize_job(job)


def retry_job(session: Session, job_id: int) -> dict:
    job = session.get(models.BatchJob, job_id)
    if not job:
        raise ValueError("job not found")
    if job.status == models.BatchJobStatus.running:
        raise ValueError("job is running")

    job.status = models.BatchJobStatus.pending
    job.attempts = 0
    job.started_at = None
    job.finished_at = None
    job.visible_until = None
    job.last_error = None

    session.add(job)
    session.commit()
    session.refresh(job)
    return _serialize_job(job)
