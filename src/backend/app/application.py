import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Iterable, Optional

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db, SessionUsers, SessionPool
from app.middleware import SecurityHeadersMiddleware, InputValidationMiddleware
from app.services.services.admin_service import create_or_update_admin_default
from app.services.services.maintenance import create_maintenance_service
from app.services.services.rate_limiter_service import init_rate_limiter, close_rate_limiter
from app.security import hash_password
from app.domain_context import (
    ServiceDomain,
    set_service_domain,
)

try:
    from app.metrics_prom import maintenance_lock_miss_total, maintenance_lock_acquired_total
except Exception:  # pragma: no cover - metrics optional
    maintenance_lock_miss_total = maintenance_lock_acquired_total = None  # type: ignore

logger = logging.getLogger(__name__)


def build_app_lifespan(domain: ServiceDomain):
    @asynccontextmanager
    async def _lifespan(_: FastAPI):
        """
        Shared lifespan manager for every FastAPI 实例（Users/Pool/Monolith）。
        """

        set_service_domain(domain)
        init_db()
        await init_rate_limiter()
        logger.info("Rate limiter initialized")

        # 初始化管理员记录（若不存在），避免登录路由隐式写库
        try:
            db = SessionUsers()
            try:
                create_or_update_admin_default(db, hash_password(settings.admin_initial_password))
            finally:
                db.close()
        except Exception:
            logger.exception("Failed to ensure default admin record on startup")

        stop_event = asyncio.Event()
        maintenance_task: Optional[asyncio.Task] = None

    def _run_maintenance_once():
        """
        执行一次维护循环（同步函数，供线程池调用）。
        """
        db_users = SessionUsers()
        db_pool = SessionPool()
        maintenance_service = create_maintenance_service(db_users, db_pool)
        # 使用 Redis 分布式锁避免多实例并发执行维护逻辑
        lock_client = None
        lock_token = None
        try:
            from app.utils.locks import try_acquire_lock, release_lock

            lock_ttl = int(max(5, settings.maintenance_interval_seconds * 2))
            lock_name = f"{settings.rate_limit_namespace}:maintenance_lock"
            lock_client, lock_token = try_acquire_lock(lock_name, lock_ttl)
            if lock_client is None and lock_token is None:
                # 未获取到锁（被其他实例占用），记录一次指标便于观测
                try:
                    if maintenance_lock_miss_total is not None:
                        maintenance_lock_miss_total.inc()
                except Exception:
                    pass
                return
            else:
                try:
                    if maintenance_lock_acquired_total is not None and lock_client is not None:
                        maintenance_lock_acquired_total.inc()
                except Exception:
                    pass
        except Exception:
            # 获取锁异常时继续执行（单实例或无 Redis 场景）
            pass
        try:
            freed = maintenance_service.cleanup_stale_held()
            if freed:
                logger.info("cleanup_stale_held: freed %s seats", freed)

            try:
                checked = maintenance_service.check_mother_health(
                    limit=settings.mother_health_check_batch_size
                )
                if checked:
                    logger.info("check_mother_health: probed %s mothers", checked)
            except Exception:
                logger.exception("check_mother_health error")

            deleted = maintenance_service.cleanup_expired_mother_teams()
            if deleted:
                logger.info("cleanup_expired_mother_teams: deleted %s teams", deleted)
            try:
                accepted = maintenance_service.sync_invite_acceptance(
                    days=settings.invite_sync_days,
                    limit_groups=settings.invite_sync_group_limit,
                )
                if accepted:
                    logger.info("sync_invite_acceptance: updated %s invites to accepted", accepted)
            except Exception:
                logger.exception("sync_invite_acceptance error")
            try:
                expired_codes = maintenance_service.cleanup_expired_codes()
                if expired_codes:
                    logger.info("cleanup_expired_codes: deactivated %s codes", expired_codes)
            except Exception:
                logger.exception("cleanup_expired_codes error")
            try:
                processed_switch = maintenance_service.process_switch_queue()
                if processed_switch:
                    logger.info("process_switch_queue: processed %s requests", processed_switch)
            except Exception:
                logger.exception("process_switch_queue error")
            # 处理异步批量任务
            try:
                from app.services.services.jobs import process_one_job

                processed = 0
                # 处理少量任务，避免阻塞
                for _ in range(3):
                    if process_one_job(db_users, pool_session_factory=SessionPool):
                        processed += 1
                    else:
                        break
                if processed:
                    logger.info("batch jobs processed: %s", processed)
            except Exception:
                logger.exception("batch jobs processing error")
        finally:
            # 释放锁
            try:
                if lock_client and lock_token:
                    from app.utils.locks import release_lock

                    release_lock(lock_client, f"{settings.rate_limit_namespace}:maintenance_lock", lock_token)
            except Exception:
                pass
            db_pool.close()
            db_users.close()

    async def _maintenance_worker():
        """
        定期清理过期座位与母号数据。
        """
        backoff = 5.0
        while not stop_event.is_set():
            try:
                await asyncio.to_thread(_run_maintenance_once)
                backoff = 5.0
            except Exception:
                logger.exception("maintenance loop error")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 300.0)
                continue

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=float(settings.maintenance_interval_seconds))
            except asyncio.TimeoutError:
                continue

        # 测试环境禁用后台维护循环，避免 in-memory sqlite 与外部线程交互导致异常
        if settings.env not in ("test", "testing"):
            maintenance_task = asyncio.create_task(_maintenance_worker())

            try:
                yield
            finally:
                stop_event.set()
                if maintenance_task:
                    maintenance_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await maintenance_task
                await close_rate_limiter()
                logger.info("Rate limiter cleaned up")
        else:
            try:
                yield
            finally:
                await close_rate_limiter()
                logger.info("Rate limiter cleaned up (test env)")

    return _lifespan


def create_application(
    *,
    title: str,
    routers: Iterable,
    include_pool_api_middleware: bool = False,
    service_domain: ServiceDomain = ServiceDomain.monolith,
    lifespan=None,
) -> FastAPI:
    """
    构建带有通用中间件/健康检查的 FastAPI 应用。
    """

    actual_lifespan = lifespan or build_app_lifespan(service_domain)
    app = FastAPI(title=title, lifespan=actual_lifespan)

    allowed_hosts = (
        ["*"] if settings.env in ("dev", "development", "test", "testing") else [settings.domain]
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
    app.add_middleware(InputValidationMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    if include_pool_api_middleware:
        from app.middleware.pool_api_auth import PoolAPIAuthMiddleware

        app.add_middleware(PoolAPIAuthMiddleware, pool_api_prefix="/pool")

    for router in routers:
        app.include_router(router)

    @app.get("/health")
    def health():
        return JSONResponse({"ok": True})

    if settings.env in ("prod", "production"):
        if not settings.encryption_key_b64 or settings.secret_key == "change-me-secret-key":
            raise RuntimeError("In production, ENCRYPTION_KEY and SECRET_KEY must be set.")
        if settings.admin_initial_password in ("admin", "admin123"):
            raise RuntimeError("In production, ADMIN_INITIAL_PASSWORD must not be the default 'admin' or 'admin123'.")
        if settings.extra_password:
            raise RuntimeError("In production, EXTRA_PASSWORD is not allowed.")

    return app

