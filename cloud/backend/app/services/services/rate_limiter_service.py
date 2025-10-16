"""
限流器服务
"""
import logging
from typing import Optional

try:
    import redis.asyncio as redis  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    redis = None

try:  # pragma: no cover - optional dependency
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover
    class RedisError(Exception):
        pass

from app.config import settings
from app.utils.utils.rate_limiter import (
    RedisTokenBucketLimiter,
    MemoryTokenBucketLimiter,
    RateLimitConfig,
    RateLimiter,
)
from app.utils.utils.rate_limiter.strategies import IPKeyStrategy, EmailKeyStrategy, PathKeyStrategy

logger = logging.getLogger(__name__)

# 全局限流器实例
_rate_limiter: Optional[RateLimiter] = None
_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> Optional[redis.Redis]:
    """获取Redis客户端"""
    global _redis_client
    if _redis_client is None and settings.rate_limit_enabled and redis is not None:
        try:
            _redis_client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                password=settings.redis_password,
            )
            # 测试连接
            await _redis_client.ping()
            logger.info("Redis client initialized successfully")
        except Exception as e:
            if settings.rate_limit_warn_on_fallback:
                logger.warning("Redis unavailable (%s); using in-memory limiter.", e)
            else:
                logger.debug("Redis unavailable (%s); using in-memory limiter.", e)
            _redis_client = None
    return _redis_client


async def init_rate_limiter() -> RateLimiter:
    """初始化限流器"""
    global _rate_limiter
    if _rate_limiter is not None:
        return _rate_limiter

    if not settings.rate_limit_enabled:
        logger.info("Rate limiting is disabled")
        _rate_limiter = MemoryTokenBucketLimiter(RateLimitConfig(capacity=1000, refill_rate=100.0))
        return _rate_limiter

    redis_client = await get_redis_client()
    if redis_client and redis is not None:
        try:
            # 默认配置：每分钟60次请求
            default_config = RateLimitConfig(
                capacity=60,
                refill_rate=1.0,
                expire_seconds=3600,
                name="default"
            )
            _rate_limiter = RedisTokenBucketLimiter(
                redis_client,
                default_config,
                namespace=settings.rate_limit_namespace,
            )
            logger.info("Redis rate limiter initialized successfully")
        except Exception as e:
            if not settings.rate_limit_allow_memory_fallback:
                raise RuntimeError(
                    "Rate limiter requires Redis but initialization failed; "
                    "set RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true to permit in-memory fallback."
                ) from e
            logger.error(f"Failed to initialize Redis rate limiter: {e}. Using memory limiter.")
            _rate_limiter = MemoryTokenBucketLimiter(RateLimitConfig(capacity=60, refill_rate=1.0))
    else:
        if settings.rate_limit_enabled and not settings.rate_limit_allow_memory_fallback:
            raise RuntimeError(
                "Rate limiter requires Redis but no client is available; "
                "configure Redis or set RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true to allow in-memory fallback."
            )
        logger.info("Using memory rate limiter")
        _rate_limiter = MemoryTokenBucketLimiter(RateLimitConfig(capacity=60, refill_rate=1.0))

    try:
        await setup_rate_limit_configs()
    except Exception as exc:
        logger.warning("Failed to apply rate limit configs: %s", exc)

    return _rate_limiter


async def setup_rate_limit_configs():
    """设置预定义的限流配置"""
    limiter = await get_rate_limiter()
    configs = {
        # 兑换码接口：每小时5次
        "redeem:by_ip": RateLimitConfig(
            capacity=5,
            refill_rate=5.0 / 3600.0,  # 每小时5次
            expire_seconds=3600,
            name="redeem_ip"
        ),
        # 重发邀请：每小时3次
        "resend:by_ip": RateLimitConfig(
            capacity=3,
            refill_rate=3.0 / 3600.0,  # 每小时3次
            expire_seconds=3600,
            name="resend_ip"
        ),
        # 邮箱重发：每小时2次
        "resend:by_email": RateLimitConfig(
            capacity=2,
            refill_rate=2.0 / 3600.0,  # 每小时2次
            expire_seconds=3600,
            name="resend_email"
        ),
        # 管理员接口：每分钟100次
        "admin:by_ip": RateLimitConfig(
            capacity=100,
            refill_rate=100.0 / 60.0,  # 每分钟100次
            expire_seconds=300,
            name="admin_ip"
        ),
        # 远程录号：每分钟60次（按IP）
        "ingest:by_ip": RateLimitConfig(
            capacity=60,
            refill_rate=60.0 / 60.0,  # 每分钟60次
            expire_seconds=120,
            name="ingest_ip"
        ),
    }

    for config_id, config in configs.items():
        await limiter.set_config(config_id, config)
        logger.debug("Set rate limit config: %s", config_id)


async def get_rate_limiter() -> RateLimiter:
    """获取限流器实例"""
    if _rate_limiter is None:
        return await init_rate_limiter()
    return _rate_limiter


async def close_rate_limiter():
    """关闭限流器连接"""
    global _redis_client, _rate_limiter
    if _redis_client:
        try:
            await _redis_client.close()
            logger.info("Redis client closed")
        except Exception as e:
            logger.error(f"Error closing Redis client: {e}")
        finally:
            _redis_client = None
    _rate_limiter = None


# 键策略实例
ip_strategy = IPKeyStrategy()
email_strategy = EmailKeyStrategy()
path_strategy = PathKeyStrategy()
