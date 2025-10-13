"""
限流器配置模块
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RateLimitConfig:
    """
    令牌桶配置

    Args:
        capacity: 最大桶容量（最大突发请求数）
        refill_rate: 每秒添加的令牌数（浮点数）
        expire_seconds: 可选的键过期时间，用于保持Redis清洁（0=不过期）
        name: 可选的配置名称
    """
    capacity: int
    refill_rate: float
    expire_seconds: int = 0
    name: Optional[str] = None

    def validate(self) -> None:
        """验证配置参数"""
        if self.capacity <= 0:
            raise ValueError("capacity must be > 0")
        if self.refill_rate <= 0:
            raise ValueError("refill_rate must be > 0")
        if self.expire_seconds < 0:
            raise ValueError("expire_seconds must be >= 0")