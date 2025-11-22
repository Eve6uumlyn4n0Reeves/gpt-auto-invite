"""
Pool 域专用 FastAPI 入口。

启动方式（示例）：
    uvicorn pool_app.main:app --reload --port 8002
"""
from app.application import create_application
from app.domain_context import ServiceDomain
from app.routers import pool_api
from app.routers.admin import build_pool_admin_router
from app.routers.routers import ingest as ingest_router
from app.routers.routers import metrics as metrics_router
from app.routers.routers import mother_ingest_public as ingest_public_router
from app.routers.routers import rate_limit as rate_limit_router
from app.routers.routers import stats as stats_router


def _pool_routers():
    return [
        build_pool_admin_router(),
        stats_router.router,
        metrics_router.router,
        rate_limit_router.router,
        ingest_router.router,
        ingest_public_router.router,
        pool_api.router,
    ]


app = create_application(
    title="GPT Invite Pool Service",
    routers=_pool_routers(),
    include_pool_api_middleware=True,
    service_domain=ServiceDomain.pool,
)

