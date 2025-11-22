from __future__ import annotations

"""
Domain-scoped helpers.

- `set_service_domain("users" | "pool" | "monolith")` 在 FastAPI 启动阶段调用；
- `get_service_domain()` 在运行时获取当前域；
- `ensure_domain_allows("users" | "pool")` 在敏感操作前检查是否越界；
- 通过环境变量 `STRICT_DOMAIN_GUARD=true` 来强制检查。
"""

from contextvars import ContextVar
from enum import Enum
from typing import Literal

from app.config import settings


class ServiceDomain(str, Enum):
    users = "users"
    pool = "pool"
    monolith = "monolith"


_domain_var: ContextVar[ServiceDomain] = ContextVar("service_domain", default=ServiceDomain.monolith)


def set_service_domain(domain: ServiceDomain | Literal["users", "pool", "monolith"]) -> None:
    if isinstance(domain, str):
        _domain_var.set(ServiceDomain(domain))
    else:
        _domain_var.set(domain)


def get_service_domain() -> ServiceDomain:
    return _domain_var.get()


def ensure_domain_allows(target: ServiceDomain | Literal["users", "pool"]) -> None:
    """
    在 STRICT_DOMAIN_GUARD = true 时，确保当前域允许访问目标数据库。
    - users 域只允许访问 users；
    - pool 域只允许访问 pool；
    - monolith 域允许访问两者。
    """
    if not getattr(settings, "strict_domain_guard", False):
        return

    current = get_service_domain()
    target_domain = ServiceDomain(target) if isinstance(target, str) else target
    if current is ServiceDomain.monolith:
        return
    if current is target_domain:
        return
    raise RuntimeError(
        f"当前服务域为 {current.value}，禁止访问 {target_domain.value} 域的数据库；"
        "如确需跨域，请改用 HTTP API 或显式集成服务。",
    )

