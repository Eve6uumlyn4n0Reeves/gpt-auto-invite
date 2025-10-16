"""
母号管理相关路由
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.schemas import (
    MotherBatchImportItemResult,
    MotherBatchItemIn,
    MotherBatchValidateItemOut,
    MotherCreateIn,
    MotherTeamIn,
)
from app.security import encrypt_token
from app.services.services import audit as audit_svc
from app.services.services.admin import create_mother, list_mothers_with_usage
from app.services.services.bulk_history import record_bulk_operation
from app.utils.csrf import require_csrf_token

from .dependencies import admin_ops_rate_limit_dep, get_db, require_admin

router = APIRouter()


@router.post("/mothers")
async def create_mother_account(
    payload: MotherCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)
    await require_csrf_token(request)

    try:
        mother = create_mother(
            db,
            payload.name,
            payload.access_token,
            payload.token_expires_at,
            [t.model_dump() for t in payload.teams],
            payload.notes,
        )
        audit_svc.log(
            db,
            actor="admin",
            action="create_mother",
            target_type="mother",
            target_id=str(mother.id),
        )
        return {"ok": True, "mother_id": mother.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"创建失败: {e}")


@router.get("/mothers")
def list_mothers(
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    page_size: int = Query(20, ge=1, le=200, description="每页数量，默认20，最大200"),
    search: Optional[str] = Query(None, description="按母号名称搜索"),
):
    require_admin(request, db)
    items, total, current_page, total_pages = list_mothers_with_usage(
        db,
        page=page,
        page_size=page_size,
        search=search,
    )
    return {
        "items": items,
        "pagination": {
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


@router.post("/mothers/batch/import-text")
async def batch_mothers_import_text(request: Request, db: Session = Depends(get_db), delim: str = "---"):
    """以纯文本批量导入母号"""
    require_admin(request, db)
    body_bytes = await request.body()
    try:
        text = body_bytes.decode("utf-8", errors="ignore")
    except Exception:
        text = body_bytes.decode(errors="ignore")

    results = []
    lines = [s.strip() for s in text.splitlines() if s.strip()]
    for i, line in enumerate(lines):
        try:
            parts = line.split(delim)
            if len(parts) < 2:
                sp = line.split()
                if len(sp) >= 2:
                    parts = [sp[0], " ".join(sp[1:])]
            email = (parts[0] or "").strip()
            token = (parts[1] or "").strip()
            if not email or not token:
                raise ValueError("格式错误：缺少邮箱或Token")

            mother = create_mother(
                db,
                name=email,
                access_token=token,
                token_expires_at=None,
                teams=[],
                notes=None,
            )
            results.append({"index": i, "success": True, "mother_id": mother.id})
        except Exception as e:
            results.append({"index": i, "success": False, "error": str(e)})

    try:
        success_count = sum(1 for item in results if item.get("success"))
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.mother_import_text,
            actor="admin",
            total_count=len(results),
            success_count=success_count,
            failed_count=len(results) - success_count,
            metadata={
                "delimiter": delim,
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass

    return results


@router.post("/mothers/batch/validate", response_model=List[MotherBatchValidateItemOut])
def batch_mothers_validate(payload: List[MotherBatchItemIn], request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    out: List[MotherBatchValidateItemOut] = []
    for i, item in enumerate(payload):
        warnings: list[str] = []
        valid = True
        if not item.name or not item.access_token:
            valid = False
            warnings.append("缺少 name 或 access_token")
        default_seen = False
        teams_norm: list[MotherTeamIn] = []
        seen_team_ids: set[str] = set()
        for t in item.teams:
            if t.team_id in seen_team_ids:
                warnings.append(f"重复的 team_id: {t.team_id}")
                continue
            seen_team_ids.add(t.team_id)
            is_def = bool(t.is_default) and not default_seen
            if t.is_default and default_seen:
                warnings.append("多于一个默认团队，已保留第一个默认")
            if is_def:
                default_seen = True
            teams_norm.append(
                MotherTeamIn(
                    team_id=t.team_id,
                    team_name=t.team_name,
                    is_enabled=bool(t.is_enabled),
                    is_default=is_def,
                )
            )
        out.append(
            MotherBatchValidateItemOut(index=i, name=item.name, valid=valid, warnings=warnings, teams=teams_norm)
        )
    return out


@router.post("/mothers/batch/import", response_model=List[MotherBatchImportItemResult])
def batch_mothers_import(payload: List[MotherBatchItemIn], request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    results: List[MotherBatchImportItemResult] = []
    for i, item in enumerate(payload):
        try:
            default_set = False
            teams: list[dict] = []
            seen: set[str] = set()
            for t in item.teams:
                if t.team_id in seen:
                    continue
                seen.add(t.team_id)
                is_def = bool(t.is_default) and not default_set
                if is_def:
                    default_set = True
                teams.append(
                    {
                        "team_id": t.team_id,
                        "team_name": t.team_name,
                        "is_enabled": bool(t.is_enabled),
                        "is_default": is_def,
                    }
                )

            mother = create_mother(
                db,
                name=item.name,
                access_token=item.access_token,
                token_expires_at=item.token_expires_at,
                teams=teams,
                notes=item.notes,
            )
            results.append(MotherBatchImportItemResult(index=i, success=True, mother_id=mother.id))
        except Exception as e:
            results.append(MotherBatchImportItemResult(index=i, success=False, error=str(e)))
    try:
        success_count = sum(1 for item in results if item.success)
        record_bulk_operation(
            db,
            operation_type=models.BulkOperationType.mother_import,
            actor="admin",
            total_count=len(results),
            success_count=success_count,
            failed_count=len(results) - success_count,
            metadata={
                "request_ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        pass
    return results


@router.put("/mothers/{mother_id}")
def update_mother(
    mother_id: int,
    payload: MotherCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    mother = db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    mother.name = payload.name
    mother.notes = payload.notes

    if payload.access_token:
        mother.access_token_enc = encrypt_token(payload.access_token)
        mother.token_expires_at = payload.token_expires_at or (
            datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        )

    db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()

    default_set = False
    for t in payload.teams:
        is_def = bool(t.is_default) and not default_set
        if is_def:
            default_set = True
        db.add(
            models.MotherTeam(
                mother_id=mother_id,
                team_id=t.team_id,
                team_name=t.team_name,
                is_enabled=bool(t.is_enabled),
                is_default=is_def,
            )
        )

    db.add(mother)
    db.commit()

    audit_svc.log(db, actor="admin", action="update_mother", target_type="mother", target_id=str(mother_id))
    return {"ok": True, "message": "母号更新成功"}


@router.delete("/mothers/{mother_id}")
def delete_mother(
    mother_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, db)

    mother = db.query(models.MotherAccount).filter(models.MotherAccount.id == mother_id).first()
    if not mother:
        raise HTTPException(status_code=404, detail="母号不存在")

    used_seats = db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

    if used_seats > 0:
        raise HTTPException(status_code=400, detail=f"无法删除：该母号仍有 {used_seats} 个座位在使用")

    db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother_id).delete()
    db.query(models.SeatAllocation).filter(models.SeatAllocation.mother_id == mother_id).delete()
    db.delete(mother)
    db.commit()

    audit_svc.log(db, actor="admin", action="delete_mother", target_type="mother", target_id=str(mother_id))
    return {"ok": True, "message": "母号删除成功"}


__all__ = ["router"]
