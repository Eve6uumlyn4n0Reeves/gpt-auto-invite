"""
异步批量任务路由
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import json

from app import models
from app.schemas import BatchOpIn
from app.services.services.jobs import enqueue_users_job
from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin

router = APIRouter()


@router.post("/batch/users/async")
def batch_users_async(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    action = payload.action
    ids = payload.ids or []
    confirm = bool(payload.confirm)

    if not confirm:
        raise HTTPException(status_code=400, detail="缺少确认")
    if not action or not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="参数错误")

    try:
        job = enqueue_users_job(db, action, ids, actor="admin")
        return {"success": True, "job_id": job.id, "status": job.status.value}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/jobs")
def list_jobs(
    request: Request,
    db: Session = Depends(get_db),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    require_admin(request, db)

    q = db.query(models.BatchJob)
    if status:
        try:
            st = models.BatchJobStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail="无效的状态")
        q = q.filter(models.BatchJob.status == st)

    total = q.count()
    if total == 0:
        return {"items": [], "pagination": {"page": page, "page_size": page_size, "total": 0, "total_pages": 0}}

    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, total_pages))
    items = (
        q.order_by(models.BatchJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    def as_dict(job: models.BatchJob):
        return {
            "id": job.id,
            "job_type": job.job_type.value,
            "status": job.status.value,
            "actor": job.actor,
            "total_count": job.total_count,
            "success_count": job.success_count,
            "failed_count": job.failed_count,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }

    return {
        "items": [as_dict(x) for x in items],
        "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": total_pages},
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    job = db.get(models.BatchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {
        "id": job.id,
        "job_type": job.job_type.value,
        "status": job.status.value,
        "actor": job.actor,
        "total_count": job.total_count,
        "success_count": job.success_count,
        "failed_count": job.failed_count,
        "last_error": job.last_error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "payload": json.loads(job.payload_json or "{}"),
    }
