"""
管理后台路由集合
"""
from fastapi import APIRouter

from . import (
    auth,
    mothers,
    mother_groups,
    codes,
    batch,
    invites,
    integrations,
    users,
    audit,
    performance,
    quota,
    bulk_history,
    jobs,
    pool_groups,
    system,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

router.include_router(auth.router)
router.include_router(mothers.router)
router.include_router(mother_groups.router)
router.include_router(codes.router)
router.include_router(batch.router)
router.include_router(invites.router)
router.include_router(integrations.router)
router.include_router(users.router)
router.include_router(audit.router)
router.include_router(performance.router)
router.include_router(quota.router)
router.include_router(bulk_history.router)
router.include_router(jobs.router)
router.include_router(pool_groups.router)
router.include_router(system.router)

__all__ = ["router"]
