from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app import models
from app.metrics_prom import CONTENT_TYPE_LATEST  # noqa: F401 ensure init
try:
    from app.metrics_prom import Counter, Histogram
except Exception:
    Counter = Histogram = None
import time

if Counter is not None:
    batch_jobs_processed_total = Counter('batch_jobs_processed_total', 'Total number of batch jobs processed', labelnames=('type','status'))
    batch_job_failures_total = Counter('batch_job_failures_total', 'Total number of batch job item failures', labelnames=('type',))
    batch_job_processing_ms = Histogram('batch_job_processing_ms', 'Batch job processing latency (ms)', labelnames=('type',), buckets=(50,100,200,400,800,1600,3200,6400))
from app.services.services.invites import resend_invite, cancel_invite, remove_member
from app.config import settings


def enqueue_users_job(db: Session, action: str, ids: List[int], *, actor: str = "admin") -> models.BatchJob:
    mapping = {
        "resend": models.BatchJobType.users_resend,
        "cancel": models.BatchJobType.users_cancel,
        "remove": models.BatchJobType.users_remove,
    }
    if action not in mapping:
        raise ValueError("unsupported users batch action")

    job = models.BatchJob(
        job_type=mapping[action],
        status=models.BatchJobStatus.pending,
        actor=actor,
        payload_json=json.dumps({"ids": ids}, ensure_ascii=False),
        total_count=len(ids),
        success_count=0,
        failed_count=0,
        attempts=0,
        max_attempts=settings.job_max_attempts,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _is_pg(db: Session) -> bool:
    dialect = getattr(getattr(db, 'bind', None), 'dialect', None)
    return bool(dialect and getattr(dialect, 'name', '').startswith('postgres'))

from typing import Optional

def get_next_pending_job(db: Session) -> Optional[models.BatchJob]:
    now = datetime.utcnow()
    # 使过期 running 的任务可再次被调度
    try:
        from sqlalchemy import update
        db.execute(
            update(models.BatchJob)
            .where(
                models.BatchJob.status == models.BatchJobStatus.running,
                models.BatchJob.visible_until != None,  # noqa: E711
                models.BatchJob.visible_until < now,
            )
            .values(status=models.BatchJobStatus.pending, started_at=None, visible_until=None)
        )
        db.commit()
    except Exception:
        db.rollback()
    if _is_pg(db):
        from sqlalchemy import select
        job = db.execute(
            select(models.BatchJob)
            .where(models.BatchJob.status == models.BatchJobStatus.pending)
            .order_by(models.BatchJob.created_at.asc())
            .with_for_update(skip_locked=True)
        ).scalars().first()
        if not job:
            return None
        job.status = models.BatchJobStatus.running
        job.started_at = now
        job.visible_until = now + __import__("datetime").timedelta(seconds=settings.job_visibility_timeout_seconds)
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
    # 非PG：CAS 方式占用，避免重复执行
    attempts = 5
    from sqlalchemy import update
    while attempts > 0:
        attempts -= 1
        # 先找一条候选
        candidate = (
            db.query(models.BatchJob)
            .filter(
                models.BatchJob.status == models.BatchJobStatus.pending,
                (models.BatchJob.visible_until == None) | (models.BatchJob.visible_until <= now),  # noqa: E711
            )
            .order_by(models.BatchJob.created_at.asc())
            .first()
        )
        if not candidate:
            return None
        res = db.execute(
            update(models.BatchJob)
            .where(
                models.BatchJob.id == candidate.id,
                models.BatchJob.status == models.BatchJobStatus.pending,
            )
            .values(
                status=models.BatchJobStatus.running,
                started_at=now,
                visible_until=now + __import__("datetime").timedelta(seconds=settings.job_visibility_timeout_seconds),
            )
        )
        if res.rowcount == 1:
            db.commit()
            job = db.get(models.BatchJob, candidate.id)
            return job
        db.rollback()
    return None


def _process_users_job(db: Session, job: models.BatchJob) -> Tuple[int, int]:
    payload = json.loads(job.payload_json or "{}")
    ids: List[int] = payload.get("ids", [])
    success = 0
    failed = 0

    action = job.job_type
    # Heartbeat/lease renewal: extend visibility periodically during long runs
    heartbeat_interval = max(5, int(settings.job_visibility_timeout_seconds / 3))
    last_heartbeat = time.time()
    for uid in ids:
        inv = db.query(models.InviteRequest).filter(models.InviteRequest.id == uid).first()
        if not inv or not inv.email or not inv.team_id:
            failed += 1
            continue
        if action == models.BatchJobType.users_resend:
            ok, _ = resend_invite(db, inv.email, inv.team_id)
        elif action == models.BatchJobType.users_cancel:
            ok, _ = cancel_invite(db, inv.email, inv.team_id)
        elif action == models.BatchJobType.users_remove:
            ok, _ = remove_member(db, inv.email, inv.team_id)
        else:
            ok = False
        if ok:
            success += 1
        else:
            failed += 1
        # Heartbeat: extend lease if needed
        now_ts = time.time()
        if now_ts - last_heartbeat >= heartbeat_interval:
            last_heartbeat = now_ts
            try:
                job.visible_until = datetime.utcnow() + __import__("datetime").timedelta(seconds=settings.job_visibility_timeout_seconds)
                db.add(job)
                db.commit()
                db.refresh(job)
            except Exception:
                db.rollback()
    return success, failed


def process_one_job(db: Session) -> bool:
    job = get_next_pending_job(db)
    if not job:
        return False
    try:
        t0 = time.time()
        if job.job_type in (
            models.BatchJobType.users_resend,
            models.BatchJobType.users_cancel,
            models.BatchJobType.users_remove,
        ):
            ok, fail = _process_users_job(db, job)
        else:
            ok, fail = 0, job.total_count or 0

        job.success_count = ok
        job.failed_count = fail
        # 尝试累加尝试次数
        job.attempts = (job.attempts or 0) + 1
        if fail and job.attempts < (job.max_attempts or settings.job_max_attempts):
            # 仍有失败但未达上限，重新入队
            job.status = models.BatchJobStatus.pending
            job.visible_until = None
            job.started_at = None
        else:
            job.status = models.BatchJobStatus.succeeded
        if Counter is not None:
            batch_jobs_processed_total.labels(type=job.job_type.value, status='succeeded').inc()
            if fail:
                batch_job_failures_total.labels(type=job.job_type.value).inc(fail)
    except Exception as e:
        job.last_error = str(e)
        job.status = models.BatchJobStatus.failed
        if Counter is not None:
            batch_jobs_processed_total.labels(type=job.job_type.value if job else 'unknown', status='failed').inc()
    finally:
        job.finished_at = datetime.utcnow()
        db.add(job)
        db.commit()
        if Histogram is not None:
            try:
                batch_job_processing_ms.labels(type=job.job_type.value if job else 'unknown').observe((time.time()-t0)*1000)
            except Exception:
                pass
    return True
