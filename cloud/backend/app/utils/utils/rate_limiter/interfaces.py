"""
限流器接口定义
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Any, Mapping, Coroutine, runtime_checkable


@dataclass(frozen=True)
class RateLimitResult:
    """限流检查结果"""
    allowed: bool
    remaining: int
    retry_after_ms: int
    reset_at_ms: int
    limit: int
    key: str
    strategy: Optional[str] = None


@dataclass(frozen=True)
class RateLimitStatus:
    """限流状态信息"""
    remaining: int
    reset_at_ms: int
    limit: int
    key: str


@dataclass(frozen=True)
class RateLimitStats:
    """限流统计信息"""
    key: str
    allowed: int
    denied: int
    last_allowed_ms: Optional[int]
    last_denied_ms: Optional[int]
    remaining: int
    capacity: int


@runtime_checkable
class RateLimiter(Protocol):
    """限流器协议接口"""

    async def allow(
        self,
        key: str,
        tokens: int = 1,
        *,
        config: Optional["RateLimitConfig"] = None,
        strategy: Optional[str] = None,
        as_peek: bool = False,
    ) -> RateLimitResult: ...

    async def get_status(
        self,
        key: str,
        *,
        config: Optional["RateLimitConfig"] = None,
    ) -> RateLimitStatus: ...

    async def get_stats(self, key: str) -> RateLimitStats: ...

    async def set_config(self, config_id: str, config: "RateLimitConfig") -> None: ...

    async def get_config(self, config_id: str) -> Optional["RateLimitConfig"]: ...

    async def delete_config(self, config_id: str) -> None: ...


# late import to avoid cycle in typing (only used in annotations)
from .config import RateLimitConfig  # noqa: E402