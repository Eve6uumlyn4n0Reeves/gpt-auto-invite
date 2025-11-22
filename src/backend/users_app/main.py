"""
Users 域专用 FastAPI 入口。

启动方式（示例）：
    uvicorn users_app.main:app --reload --port 8001
"""
from app.application import create_application
from app.domain_context import ServiceDomain
from app.routers.admin import build_users_admin_router
from app.routers.routers import metrics as metrics_router
from app.routers.routers import public as public_router
from app.routers.routers import rate_limit as rate_limit_router
from app.routers.routers import stats as stats_router


def _users_routers():
    return [
        public_router.router,
        build_users_admin_router(),
        stats_router.router,
        metrics_router.router,
        rate_limit_router.router,
    ]


app = create_application(
    title="GPT Invite Users Service",
    routers=_users_routers(),
    include_pool_api_middleware=False,
    service_domain=ServiceDomain.users,
)

