import base64
import os
import logging
from dataclasses import dataclass
from typing import Optional


logger = logging.getLogger(__name__)


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")
    http_proxy: Optional[str] = os.getenv("HTTP_PROXY")
    https_proxy: Optional[str] = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    admin_session_ttl_seconds: int = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
    # 默认母号 token 过期逻辑：若上游未提供 expires，则按该天数回退
    token_default_ttl_days: int = int(os.getenv("TOKEN_DEFAULT_TTL_DAYS", "40"))

    extra_password: Optional[str] = os.getenv("EXTRA_PASSWORD")
    extra_password_start_at_raw: Optional[str] = os.getenv("EXTRA_PASSWORD_START_AT")

    max_login_attempts: int = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
    login_lockout_duration: int = int(os.getenv("LOGIN_LOCKOUT_DURATION", "300"))  # 5分钟
    session_timeout_warning: int = int(os.getenv("SESSION_TIMEOUT_WARNING", "300"))  # 会话到期前提示秒数
    domain: str = os.getenv("DOMAIN", "localhost")  # 用于CSRF和安全头部验证

    # Redis配置
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD")
    redis_db: int = int(os.getenv("REDIS_DB", "0"))
    redis_url: str = os.getenv("REDIS_URL", f"redis://{redis_host}:{redis_port}/{redis_db}")
    rate_limit_warn_on_fallback: bool = os.getenv("RATE_LIMIT_WARN_ON_FALLBACK", "true").lower() == "true"
    rate_limit_allow_memory_fallback_raw: Optional[str] = os.getenv("RATE_LIMIT_ALLOW_MEMORY_FALLBACK")

    # 限流配置
    rate_limit_enabled: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    rate_limit_namespace: str = os.getenv("RATE_LIMIT_NAMESPACE", "gpt_invite:rate")
    csrf_allowed_origins_raw: Optional[str] = os.getenv("CSRF_ALLOWED_ORIGINS")

    @property
    def encryption_key(self) -> bytes:
        cached = getattr(self, "_encryption_key_bytes", None)
        if cached is not None:
            return cached

        if not self.encryption_key_b64:
            if self.env in ("prod", "production"):
                raise RuntimeError("ENCRYPTION_KEY environment variable is required in production")
            key = os.urandom(32)
            self._encryption_key_bytes = key
            logger.warning("Generated ephemeral encryption key for %s environment; data encrypted in this session will not be readable after restart.", self.env)
            return key

        try:
            key = base64.b64decode(self.encryption_key_b64)
            if len(key) != 32:
                raise ValueError("ENCRYPTION_KEY must be 32 bytes base64")
            self._encryption_key_bytes = key
            return key
        except Exception as e:
            raise RuntimeError(f"Invalid ENCRYPTION_KEY: {e}")

    @property
    def extra_password_start_at(self):
        from datetime import datetime, timezone

        raw = self.extra_password_start_at_raw
        if not raw:
            return datetime.now(timezone.utc)  # 立即生效
        try:
            # 接受带/不带 Z
            s = raw.replace("Z", "+00:00")
            return datetime.fromisoformat(s)
        except Exception:
            # 解析失败则回退到现在，避免误锁定
            return datetime.now(timezone.utc)

    @property
    def rate_limit_allow_memory_fallback(self) -> bool:
        raw = self.rate_limit_allow_memory_fallback_raw
        if raw is not None:
            return raw.lower() == "true"
        return self.env not in ("prod", "production")

    @property
    def csrf_allowed_origins(self) -> list[str]:
        raw = self.csrf_allowed_origins_raw
        if not raw:
            return []
        origins: list[str] = []
        for item in raw.split(","):
            v = item.strip()
            if not v:
                continue
            origins.append(v.rstrip("/"))
        return origins


settings = Settings()
