"""
异步批量任务路由
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional
from sqlalchemy.orm import Session
import json

from app import models
from app.schemas import BatchOpIn
from app.services.services.jobs import enqueue_users_job
from app.services.services import admin_jobs
from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin, require_domain

router = APIRouter()


@router.post("/batch/users/async")
def batch_users_async(
    payload: BatchOpIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    # Users 域批处理接口
    import asyncio
    if hasattr(asyncio, 'create_task'):
        pass
    from app.config import settings as _s
    if _s.env not in ("dev", "development", "test", "testing") and request.headers.get('X-Domain') != 'users':
        raise HTTPException(status_code=400, detail="X-Domain 不匹配，期望 users")

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

    try:
        items, pagination = admin_jobs.list_jobs(
            db,
            status=status,
            page=page,
            page_size=page_size,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的状态")
    return {"items": items, "pagination": pagination}


@router.get("/jobs/{job_id}")
def get_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    try:
        data = admin_jobs.get_job(db, job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="任务不存在")
    payload_json = data.pop("payload", None)
    payload = json.loads(payload_json or "{}") if isinstance(payload_json, str) else payload_json
    data["payload"] = payload
    return data


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: int, request: Request, db: Session = Depends(get_db), _: None = Depends(admin_ops_rate_limit_dep)):
    require_admin(request, db)
    try:
        job_data = admin_jobs.retry_job(db, job_id)
    except ValueError as exc:
        message = str(exc)
        if message == "job not found":
            raise HTTPException(status_code=404, detail="任务不存在")
        if message == "job is running":
            raise HTTPException(status_code=400, detail="任务正在运行，不能重试")
        raise HTTPException(status_code=400, detail="重试失败")
    return {"success": True, "status": job_data["status"]}
