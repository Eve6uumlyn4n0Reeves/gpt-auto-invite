"""
FastAPI集成模块
"""
from __future__ import annotations

from typing import Optional, Callable

from fastapi import Depends, HTTPException, Request
from starlette.responses import Response

from .interfaces import RateLimiter, RateLimitConfig, RateLimitResult
from .strategies import KeyStrategy


def build_full_key(strategy: KeyStrategy, request: Request) -> str:
    """构建完整的限流键"""
    return f"{strategy.name}:{strategy.build_key(request)}"


def rate_limit(
    limiter: RateLimiter,
    strategy: KeyStrategy,
    *,
    config: Optional[RateLimitConfig] = None,
    config_id: Optional[str] = None,
    tokens: int = 1,
    header_prefix: str = "X-RateLimit",
) -> Callable[[Request], object]:
    """
    应用限流并设置标准头的FastAPI依赖。

    Args:
        limiter: RedisTokenBucketLimiter（或任何RateLimiter）实例
        strategy: 键生成策略（IP、路径、邮箱、组合等）
        config: 此依赖项的显式RateLimitConfig覆盖（可选）
        config_id: 用于从Redis获取动态配置的键（可选）
        tokens: 每次调用消耗的令牌数（默认1）
        header_prefix: 响应头前缀

    设置的响应头:
      - X-RateLimit-Limit
      - X-RateLimit-Remaining
      - X-RateLimit-Reset
      - Retry-After (429时)
    """
    async def dependency(request: Request) -> object:
        key = build_full_key(strategy, request)
        effective_config = config
        if not effective_config and config_id:
            fetched = await limiter.get_config(config_id)
            if fetched:
                effective_config = fetched

        res: RateLimitResult = await limiter.allow(
            key,
            tokens=tokens,
            config=effective_config,
            strategy=strategy.name,
        )

        # 通过request.state设置响应头；FastAPI也允许在路由中添加
        response: Optional[Response] = request.scope.get("fastapi_astack_response")  # 自定义钩子（如果设置）
        if response is not None:
            response.headers[f"{header_prefix}-Limit"] = str(res.limit)
            response.headers[f"{header_prefix}-Remaining"] = str(res.remaining)
            response.headers[f"{header_prefix}-Reset"] = str(res.reset_at_ms)

        if not res.allowed:
            headers = {
                f"{header_prefix}-Limit": str(res.limit),
                f"{header_prefix}-Remaining": str(res.remaining),
                f"{header_prefix}-Reset": str(res.reset_at_ms),
            }
            if res.retry_after_ms >= 0:
                headers["Retry-After"] = str((res.retry_after_ms + 999) // 1000)
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试", headers=headers)

        return object()

    return dependency


def rate_limit_middleware_factory(limiter: RateLimiter, strategy: KeyStrategy):
    """
    创建限流中间件的工厂函数
    """
    async def middleware(request: Request, call_next):
        # 应用限流检查
        key = build_full_key(strategy, request)
        res = await limiter.allow(key, strategy=strategy.name)

        response = await call_next(request)

        # 添加限流头
        response.headers["X-RateLimit-Limit"] = str(res.limit)
        response.headers["X-RateLimit-Remaining"] = str(res.remaining)
        response.headers["X-RateLimit-Reset"] = str(res.reset_at_ms)

        if not res.allowed and res.retry_after_ms >= 0:
            response.headers["Retry-After"] = str((res.retry_after_ms + 999) // 1000)

        return response

    return middleware