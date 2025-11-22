"""
分布式限流器包

提供基于Redis的令牌桶算法限流器，支持多种键生成策略和动态配置。
当Redis不可用时自动回退到内存限流器。

基本用法:
    from app.utils.utils.rate_limiter import RedisTokenBucketLimiter, RateLimitConfig
    from app.utils.utils.rate_limiter.strategies import IPKeyStrategy
    from app.utils.utils.rate_limiter.fastapi_integration import rate_limit

    import redis.asyncio as redis

    # 创建Redis客户端
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

    # 创建限流器
    config = RateLimitConfig(capacity=60, refill_rate=1.0, expire_seconds=3600)
    limiter = RedisTokenBucketLimiter(redis_client, config)

    # 创建FastAPI依赖
    ip_strategy = IPKeyStrategy()
    rate_limit_dep = rate_limit(limiter, ip_strategy)

    # 在路由中使用
    @app.get("/api/endpoint", dependencies=[Depends(rate_limit_dep)])
    async def endpoint():
        return {"message": "Hello"}
"""

from .config import RateLimitConfig
from .interfaces import RateLimiter, RateLimitResult, RateLimitStatus, RateLimitStats
from .redis_limiter import RedisTokenBucketLimiter
from .memory import MemoryTokenBucketLimiter
from .strategies import (
    KeyStrategy,
    IPKeyStrategy,
    PathKeyStrategy,
    EmailKeyStrategy,
    CompositeKeyStrategy,
    UserKeyStrategy,
)
from .fastapi_integration import rate_limit, rate_limit_middleware_factory, build_full_key

__version__ = "1.0.0"
__all__ = [
    # Config and interfaces
    "RateLimitConfig",
    "RateLimiter",
    "RateLimitResult",
    "RateLimitStatus",
    "RateLimitStats",
    # Implementations
    "RedisTokenBucketLimiter",
    "MemoryTokenBucketLimiter",
    # Strategies
    "KeyStrategy",
    "IPKeyStrategy",
    "PathKeyStrategy",
    "EmailKeyStrategy",
    "CompositeKeyStrategy",
    "UserKeyStrategy",
    # FastAPI integration
    "rate_limit",
    "rate_limit_middleware_factory",
    "build_full_key",
]