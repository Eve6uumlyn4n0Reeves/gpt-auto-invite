"""
内存限流器实现 - 用作Redis不可用时的降级方案
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Optional

from .config import RateLimitConfig
from .interfaces import RateLimiter, RateLimitResult, RateLimitStatus, RateLimitStats


@dataclass
class _Bucket:
    """令牌桶内部状态"""
    tokens: float
    last_refill: float  # 单调时间秒
    capacity: int
    refill_rate: float


class MemoryTokenBucketLimiter(RateLimiter):
    """
    内存令牌桶限流器，适合在Redis不可用时作为降级方案。
    通过每个键的异步锁实现线程安全。使用单调时钟。
    """

    def __init__(self, default_config: RateLimitConfig) -> None:
        default_config.validate()
        self._default = default_config
        self._buckets: Dict[str, _Bucket] = {}
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        # 简单统计
        self._allowed: Dict[str, int] = defaultdict(int)
        self._denied: Dict[str, int] = defaultdict(int)

    async def allow(
        self,
        key: str,
        tokens: int = 1,
        *,
        config: Optional[RateLimitConfig] = None,
        strategy: Optional[str] = None,
        as_peek: bool = False,
    ) -> RateLimitResult:
        cfg = config or self._default
        cfg.validate()
        lock = self._locks[key]
        now = time.monotonic()

        async with lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(
                    tokens=float(cfg.capacity),
                    last_refill=now,
                    capacity=cfg.capacity,
                    refill_rate=cfg.refill_rate,
                )
                self._buckets[key] = bucket

            # 补充令牌
            elapsed = max(0.0, now - bucket.last_refill)
            bucket.tokens = min(bucket.capacity, bucket.tokens + elapsed * bucket.refill_rate)
            bucket.last_refill = now

            allowed = bucket.tokens >= tokens
            remaining_after = bucket.tokens
            retry_after_ms = 0
            reset_at_ms = int((time.time() + max(0.0, (bucket.capacity - bucket.tokens) / bucket.refill_rate)) * 1000)

            if not as_peek:
                if allowed:
                    bucket.tokens -= tokens
                    self._allowed[key] += 1
                else:
                    # 计算获取至少1个令牌的重试时间
                    deficit = tokens - bucket.tokens
                    retry_after_s = max(0.0, deficit / bucket.refill_rate)
                    retry_after_ms = int(round(retry_after_s * 1000))
                    self._denied[key] += 1

                remaining_after = int(bucket.tokens)
            else:
                remaining_after = int(bucket.tokens)

        return RateLimitResult(
            allowed=allowed if not as_peek else True,
            remaining=int(remaining_after),
            retry_after_ms=retry_after_ms,
            reset_at_ms=reset_at_ms,
            limit=cfg.capacity,
            key=key,
            strategy=strategy,
        )

    async def get_status(self, key: str, *, config: Optional[RateLimitConfig] = None) -> RateLimitStatus:
        res = await self.allow(key, tokens=0, config=config, as_peek=True)
        return RateLimitStatus(remaining=res.remaining, reset_at_ms=res.reset_at_ms, limit=res.limit, key=key)

    async def get_stats(self, key: str) -> RateLimitStats:
        # 内存回退不跟踪时间戳；为最后时间返回None
        bucket = self._buckets.get(key)
        remaining = bucket.tokens if bucket else 0
        capacity = bucket.capacity if bucket else (self._default.capacity if self._default else 0)

        return RateLimitStats(
            key=key,
            allowed=self._allowed.get(key, 0),
            denied=self._denied.get(key, 0),
            last_allowed_ms=None,
            last_denied_ms=None,
            remaining=int(remaining),
            capacity=capacity,
        )

    async def set_config(self, config_id: str, config: RateLimitConfig) -> None:
        # 内存中：无操作；仅为接口兼容性提供
        return None

    async def get_config(self, config_id: str) -> Optional[RateLimitConfig]:
        return None

    async def delete_config(self, config_id: str) -> None:
        return None