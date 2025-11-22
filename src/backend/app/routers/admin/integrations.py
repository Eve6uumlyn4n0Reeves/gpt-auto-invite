"""
外部会话与令牌集成相关路由
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app import models, provider
from app.schemas import ImportCookieIn, ImportCookieOut
from app.config import settings
from .dependencies import admin_ops_rate_limit_dep, get_db, get_db_pool, require_admin
from app.services.services.pool_group import enqueue_pool_group_sync as enqueue_pool_group_sync_service


router = APIRouter()


@router.post("/import-cookie", response_model=ImportCookieOut)
async def import_cookie_route(
    payload: ImportCookieIn,
    request: Request,
    users_db: Session = Depends(get_db),
    pool_db: Session = Depends(get_db_pool),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    require_admin(request, users_db)
    # 不强制 CSRF，以便浏览器一键导入体验（保持原行为）

    try:
        token, expires_at, email, account_id = await run_in_threadpool(provider.fetch_session_via_cookie, payload.cookie)
        if not expires_at:
            try:
                expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
            except Exception:
                expires_at = None

        mode = (payload.mode or "user").lower()

        # mode=user: 支持选组并自动创建母号+重命名
        if mode == "user":
            if payload.mother_group_id and payload.rename_after_import:
                from app.repositories.mother_repository import MotherRepository
                from app.services.services.mother_command import MotherCommandService
                from app.services.services.team_naming import TeamNamingService
                from app.security import encrypt_token
                from app.domains.mother import MotherCreatePayload

                # 使用新服务层创建 Mother
                mother_repo = MotherRepository(pool_db)
                mother_command = MotherCommandService(pool_db, mother_repo)

                create_payload = MotherCreatePayload(
                    name=email or "",
                    access_token_enc=encrypt_token(token),
                    seat_limit=7,
                    group_id=payload.mother_group_id,
                    pool_group_id=None,
                    notes=f"imported via cookie for user group {payload.mother_group_id}",
                )

                mother_summary = mother_command.create_mother(create_payload)
                TeamNamingService.apply_naming_to_mother_teams(pool_db, mother_summary.id, template=None)
            return ImportCookieOut(
                access_token=token,
                token_expires_at=expires_at,
                user_email=email,
                account_id=account_id,
            )

        # mode=pool: 创建母号并入队号池同步
        if not payload.pool_group_id:
            raise HTTPException(status_code=400, detail="pool_group_id required for pool mode")

        from app.repositories.mother_repository import MotherRepository
        from app.services.services.mother_command import MotherCommandService
        from app.security import encrypt_token
        from app.domains.mother import MotherCreatePayload

        group_id = int(payload.pool_group_id)
        group = pool_db.get(models.PoolGroup, group_id)
        if not group or not group.is_active:
            raise HTTPException(status_code=404, detail="pool group not found or inactive")

        # 检查是否已存在同名 Mother
        existing_mother = (
            pool_db.query(models.MotherAccount)
            .filter(models.MotherAccount.name == (email or ""))
            .first()
        )
        created_now = False

        if not existing_mother:
            # 使用新服务层创建 Mother
            mother_repo = MotherRepository(pool_db)
            mother_command = MotherCommandService(pool_db, mother_repo)

            create_payload = MotherCreatePayload(
                name=email or "",
                access_token_enc=encrypt_token(token),
                seat_limit=7,
                group_id=None,
                pool_group_id=None,
                notes=f"imported via cookie for pool group {group_id}",
            )

            mother_summary = mother_command.create_mother(create_payload)
            # 获取 ORM 对象用于后续操作
            mother = pool_db.get(models.MotherAccount, mother_summary.id)
            created_now = True
        else:
            mother = existing_mother

        try:
            job = enqueue_pool_group_sync_service(pool_db, users_db, mother_id=mother.id, group_id=group_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            if created_now:
                try:
                    pool_db.delete(mother)
                    pool_db.commit()
                except Exception:
                    pool_db.rollback()
            raise HTTPException(status_code=400, detail=f"入队失败: {exc}") from exc

        return ImportCookieOut(
            access_token=token,
            token_expires_at=expires_at,
            user_email=email,
            account_id=account_id,
            job_id=job.id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"导入失败: {exc}") from exc


__all__ = ["router"]
