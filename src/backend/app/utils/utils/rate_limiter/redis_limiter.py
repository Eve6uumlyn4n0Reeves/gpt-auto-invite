"""
Redis分布式限流器实现
"""
from __future__ import annotations

import json
import logging
from typing import Optional, Tuple, List, Any, Dict, cast

try:
    from redis.asyncio import Redis  # type: ignore
    from redis.exceptions import RedisError
    REDIS_AVAILABLE = True
except ImportError:
    Redis = None
    RedisError = Exception
    REDIS_AVAILABLE = False

from .config import RateLimitConfig
from .interfaces import RateLimiter, RateLimitResult, RateLimitStatus, RateLimitStats
from .memory import MemoryTokenBucketLimiter

logger = logging.getLogger(__name__)

# Redis Lua脚本：令牌桶算法
LUA_TOKEN_BUCKET = r"""
-- KEYS:
--  1 -> bucket_key (hash)
--  2 -> stats_key  (hash)
--  3 -> denied_zset (sorted set)
-- ARGV:
--  1 -> capacity (int)
--  2 -> refill_rate_per_sec (float as string)
--  3 -> requested_tokens (int)
--  4 -> expire_seconds (int; 0 for no expiry)
--  5 -> as_peek (0 or 1)
--
-- Hash fields in bucket:
--  tokens (float), last_refill_ms (int), capacity (int), refill_rate (float)
--
-- Stats hash fields:
--  allowed (int), denied (int), last_allowed_ms (int), last_denied_ms (int),
--  remaining (int), capacity (int)
--
local bucket_key = KEYS[1]
local stats_key = KEYS[2]
local denied_zset_key = KEYS[3]

local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local expire_seconds = tonumber(ARGV[4])
local as_peek = tonumber(ARGV[5])

if capacity <= 0 then
  return {0, 0, 0, 0, 0}
end
if refill_rate <= 0 then
  -- treat as no-refill: only capacity tokens ever
  refill_rate = 0
end

-- use Redis TIME for server time
local t = redis.call('TIME')
local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local data = redis.call('HMGET', bucket_key, 'tokens', 'last_refill_ms', 'capacity', 'refill_rate')
local tokens = tonumber(data[1])
local last_refill_ms = tonumber(data[2])

if tokens == nil or last_refill_ms == nil then
  tokens = capacity
  last_refill_ms = now_ms
else
  -- normalize capacity/refill_rate from existing if present
  local existing_cap = tonumber(data[3])
  local existing_rate = tonumber(data[4])
  if existing_cap ~= nil then
    capacity = existing_cap
  end
  if existing_rate ~= nil then
    refill_rate = existing_rate
  end
end

-- refill computation
if refill_rate > 0 then
  local elapsed_ms = math.max(0, now_ms - last_refill_ms)
  local add = (elapsed_ms * refill_rate) / 1000.0
  tokens = math.min(capacity, tokens + add)
end

local allowed = 0
local retry_after_ms = 0

if requested > 0 and tokens >= requested and as_peek == 0 then
  allowed = 1
  tokens = tokens - requested
end

-- Save bucket state
redis.call('HMSET', bucket_key,
  'tokens', tostring(tokens),
  'last_refill_ms', tostring(now_ms),
  'capacity', tostring(capacity),
  'refill_rate', tostring(refill_rate)
)
if expire_seconds and expire_seconds > 0 then
  redis.call('EXPIRE', bucket_key, expire_seconds)
end

-- Stats handling
local remaining_int = math.floor(tokens + 0.000001)
if as_peek == 0 then
  if allowed == 1 then
    redis.call('HINCRBY', stats_key, 'allowed', 1)
    redis.call('HSET', stats_key, 'last_allowed_ms', tostring(now_ms))
  else
    redis.call('HINCRBY', stats_key, 'denied', 1)
    redis.call('HSET', stats_key, 'last_denied_ms', tostring(now_ms))
    if denied_zset_key and denied_zset_key ~= '' then
      redis.call('ZINCRBY', denied_zset_key, 1, stats_key)
    end
    -- compute retry-after: time to accumulate deficit tokens
    if refill_rate > 0 then
      local deficit = requested - tokens
      if deficit > 0 then
        retry_after_ms = math.floor((deficit / refill_rate) * 1000.0 + 0.5)
      else
        retry_after_ms = 0
      end
    else
      retry_after_ms = -1
    end
  end
end

redis.call('HSET', stats_key, 'remaining', tostring(remaining_int))
redis.call('HSET', stats_key, 'capacity', tostring(capacity))
if expire_seconds and expire_seconds > 0 then
  redis.call('EXPIRE', stats_key, expire_seconds)
end

-- reset time: when bucket would be full if no consumption
local reset_ms
if refill_rate > 0 then
  local to_full = capacity - tokens
  if to_full <= 0 then
    reset_ms = now_ms
  else
    reset_ms = now_ms + math.floor((to_full / refill_rate) * 1000.0 + 0.5)
  end
else
  reset_ms = now_ms
end

return {allowed, remaining_int, retry_after_ms, reset_ms, capacity}
"""


class RedisTokenBucketLimiter(RateLimiter):
    """
    使用Lua脚本实现原子操作的Redis支持令牌桶限流器。
    当Redis不可用时回退到内存限流器。
    """

    def __init__(
        self,
        redis: Redis,
        default_config: RateLimitConfig,
        *,
        namespace: str = "rate:limiter",
        fallback: Optional[MemoryTokenBucketLimiter] = None,
        config_key: str = "config",  # 在namespace下用于动态配置存储的字段名
    ) -> None:
        if not REDIS_AVAILABLE:
            raise ImportError("redis is required. Install with: pip install redis>=4.5")

        default_config.validate()
        self._redis = redis
        self._ns = namespace.rstrip(":")
        self._default = default_config
        self._fallback = fallback or MemoryTokenBucketLimiter(default_config)
        self._script_sha: Optional[str] = None
        self._config_hash_key = f"{self._ns}:{config_key}"
        self._denied_zset = f"{self._ns}:denied_rank"

    async def _ensure_script(self) -> None:
        """确保Lua脚本已加载到Redis"""
        if self._script_sha is not None:
            return
        try:
            self._script_sha = await self._redis.script_load(LUA_TOKEN_BUCKET)
            logger.debug("Redis rate limiter script loaded with SHA: %s", self._script_sha)
        except RedisError as e:
            logger.warning("Failed to load rate limiter script: %s", e)
            self._script_sha = None

    def _keys_for(self, key: str) -> Tuple[str, str, str]:
        """生成Redis键名"""
        bucket = f"{self._ns}:bucket:{key}"
        stats = f"{self._ns}:stats:{key}"
        return bucket, stats, self._denied_zset

    async def _eval_token_bucket(
        self, key: str, cfg: RateLimitConfig, requested_tokens: int, as_peek: bool
    ) -> Optional[List[int]]:
        """执行令牌桶Lua脚本"""
        await self._ensure_script()
        bucket_key, stats_key, denied_zset_key = self._keys_for(key)

        argv = [
            str(cfg.capacity),
            str(cfg.refill_rate),
            str(int(requested_tokens)),
            str(int(cfg.expire_seconds or 0)),
            "1" if as_peek else "0",
        ]

        try:
            if self._script_sha:
                res = await self._redis.evalsha(self._script_sha, 3, bucket_key, stats_key, denied_zset_key, *argv)
            else:
                res = await self._redis.eval(LUA_TOKEN_BUCKET, 3, bucket_key, stats_key, denied_zset_key, *argv)
        except RedisError as e:
            logger.warning("Redis error during rate limit check: %s", e)
            return None

        # res = [allowed, remaining, retry_after_ms, reset_ms, capacity]
        try:
            out = [int(res[0]), int(res[1]), int(res[2]), int(res[3]), int(res[4])]
            return out
        except Exception as e:
            logger.error("Failed to parse Redis response: %s", e)
            return None

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

        result = await self._eval_token_bucket(key, cfg, tokens, as_peek)
        if result is None:
            # 在任何Redis问题时回退
            logger.debug("Falling back to memory limiter for key: %s", key)
            return await self._fallback.allow(key, tokens, config=cfg, strategy=strategy, as_peek=as_peek)

        allowed, remaining, retry_after_ms, reset_ms, capacity = result
        return RateLimitResult(
            allowed=bool(allowed) if not as_peek else True,
            remaining=remaining,
            retry_after_ms=retry_after_ms if not as_peek else 0,
            reset_at_ms=reset_ms,
            limit=capacity,
            key=key,
            strategy=strategy,
        )

    async def get_status(self, key: str, *, config: Optional[RateLimitConfig] = None) -> RateLimitStatus:
        res = await self.allow(key, tokens=0, config=config, as_peek=True)
        return RateLimitStatus(remaining=res.remaining, reset_at_ms=res.reset_at_ms, limit=res.limit, key=res.key)

    async def get_stats(self, key: str) -> RateLimitStats:
        bucket_key, stats_key, _ = self._keys_for(key)
        try:
            data = await self._redis.hgetall(stats_key)
            # 在Redis客户端上推荐使用decode_responses=True；仍然处理字节
            def _to_int(v: Any) -> Optional[int]:
                if v is None:
                    return None
                if isinstance(v, bytes):
                    v = v.decode()
                try:
                    return int(v)
                except Exception:
                    return None

            allowed = _to_int(data.get("allowed")) or 0
            denied = _to_int(data.get("denied")) or 0
            last_allowed_ms = _to_int(data.get("last_allowed_ms"))
            last_denied_ms = _to_int(data.get("last_denied_ms"))
            remaining = _to_int(data.get("remaining")) or 0
            capacity = _to_int(data.get("capacity")) or self._default.capacity
            return RateLimitStats(
                key=key,
                allowed=allowed,
                denied=denied,
                last_allowed_ms=last_allowed_ms,
                last_denied_ms=last_denied_ms,
                remaining=remaining,
                capacity=capacity,
            )
        except RedisError as e:
            logger.warning("Failed to get stats from Redis: %s", e)
            # 回退：没有持久化的统计数据，但提供回退所知道的
            return await self._fallback.get_stats(key)

    async def set_config(self, config_id: str, config: RateLimitConfig) -> None:
        """在Redis哈希中存储序列化配置"""
        payload = json.dumps(
            {
                "capacity": config.capacity,
                "refill_rate": config.refill_rate,
                "expire_seconds": config.expire_seconds,
                "name": config.name,
            },
            separators=(",", ":"),
        )
        try:
            await self._redis.hset(self._config_hash_key, config_id, payload)
            logger.debug("Stored rate limit config: %s", config_id)
        except RedisError as e:
            logger.warning("Failed to store rate limit config: %s", e)
            # 尽力而为：忽略失败

    async def get_config(self, config_id: str) -> Optional[RateLimitConfig]:
        """从Redis获取配置"""
        try:
            raw = await self._redis.hget(self._config_hash_key, config_id)
            if not raw:
                return None
            if isinstance(raw, bytes):
                raw = raw.decode()
            data = json.loads(raw)
            cfg = RateLimitConfig(
                capacity=int(data["capacity"]),
                refill_rate=float(data["refill_rate"]),
                expire_seconds=int(data.get("expire_seconds", 0)),
                name=data.get("name"),
            )
            return cfg
        except (RedisError, Exception) as e:
            logger.warning("Failed to get rate limit config: %s", e)
            return None

    async def delete_config(self, config_id: str) -> None:
        """删除配置"""
        try:
            await self._redis.hdel(self._config_hash_key, config_id)
            logger.debug("Deleted rate limit config: %s", config_id)
        except RedisError as e:
            logger.warning("Failed to delete rate limit config: %s", e)

    async def get_top_denied(self, limit: int = 10) -> List[Tuple[str, int]]:
        """获取被拒绝次数最多的键"""
        try:
            results = await self._redis.zrevrange(self._denied_zset, 0, limit - 1, withscores=True)
            return [(key.decode() if isinstance(key, bytes) else key, int(score)) for key, score in results]
        except RedisError as e:
            logger.warning("Failed to get top denied keys: %s", e)
            return []