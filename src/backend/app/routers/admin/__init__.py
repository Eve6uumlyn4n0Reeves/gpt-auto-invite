"""
管理后台路由集合
"""
from fastapi import APIRouter

from . import (
    audit,
    auth,
    auto_ingest,
    batch,
    bulk_history,
    children,
    codes,
    integrations,
    invites,
    jobs,
    mother_detail,
    mother_groups,
    mothers_disabled,
    performance,
    pool_groups,
    quota,
    stats_unified,
    switch,
    system,
    users,
    websocket,
)


def _build_admin_router(modules) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin"])
    for module in modules:
        router.include_router(module.router)
    return router


ALL_ADMIN_MODULES = [
    auth,
    auto_ingest,
    mother_detail,
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
    stats_unified,
    children,
    mothers_disabled,
    switch,
    websocket,
]


USERS_ADMIN_MODULES = [
    auth,
    codes,
    batch,
    invites,
    bulk_history,
    jobs,
    users,
    audit,
    performance,
    quota,
    system,
    stats_unified,
    switch,
    websocket,
]


POOL_ADMIN_MODULES = [
    auth,
    auto_ingest,
    mother_detail,
    mother_groups,
    pool_groups,
    children,
    mothers_disabled,
    integrations,
    system,
    stats_unified,
]


router = _build_admin_router(ALL_ADMIN_MODULES)


def build_users_admin_router() -> APIRouter:
    return _build_admin_router(USERS_ADMIN_MODULES)


def build_pool_admin_router() -> APIRouter:
    return _build_admin_router(POOL_ADMIN_MODULES)


__all__ = ["router", "build_users_admin_router", "build_pool_admin_router"]
