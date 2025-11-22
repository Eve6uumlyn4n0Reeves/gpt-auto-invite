from __future__ import annotations

import os
import uuid
from typing import Optional, Tuple

try:
    from redis import Redis  # type: ignore
except Exception:  # pragma: no cover
    Redis = None  # type: ignore

from app.config import settings


def _get_redis_sync_client() -> Optional["Redis"]:
    """Create a sync Redis client if possible; return None on failure or if library missing."""
    if Redis is None:
        return None
    try:
        client = Redis.from_url(settings.redis_url, password=settings.redis_password, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def try_acquire_lock(name: str, ttl_seconds: int) -> Tuple[Optional["Redis"], Optional[str]]:
    """Try to acquire a distributed lock via Redis.

    Returns (client, token) if acquired; otherwise (None, None).
    If Redis unavailable, returns (None, "no-redis") to indicate fallback/no lock.
    """
    client = _get_redis_sync_client()
    if not client:
        return None, "no-redis"
    token = uuid.uuid4().hex
    try:
        ok = client.set(name, token, nx=True, ex=max(1, ttl_seconds))
        if ok:
            return client, token
        return None, None
    except Exception:
        return None, None


def release_lock(client: Optional["Redis"], name: str, token: Optional[str]) -> None:
    if not client or not token:
        return
    # release only if token matches
    try:
        client.eval(
            """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """,
            1,
            name,
            token,
        )
    except Exception:
        import logging
        logging.getLogger(__name__).debug("release_lock failed", exc_info=True)

