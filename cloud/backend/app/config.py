import base64
import os
import logging
from dataclasses import dataclass
from typing import Optional


logger = logging.getLogger(__name__)


@dataclass
class Settings:
    # 原始数据库URL（如果未提供，则使用绝对路径SQLite默认值）
    database_url_raw: str = os.getenv("DATABASE_URL", "")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "admin123")
    http_proxy: Optional[str] = os.getenv("HTTP_PROXY")
    https_proxy: Optional[str] = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    admin_session_ttl_seconds: int = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
    # 默认母号 token 过期逻辑：若上游未提供 expires，则按该天数回退
    token_default_ttl_days: int = int(os.getenv("TOKEN_DEFAULT_TTL_DAYS", "40"))
    # 座位占位 TTL（秒），邀请发送前的持有时间，避免并发抢占
    seat_hold_ttl_seconds: int = int(os.getenv("SEAT_HOLD_TTL_SECONDS", "30"))
    # 并发占位重试设置
    seat_claim_retry_attempts: int = int(os.getenv("SEAT_CLAIM_RETRY_ATTEMPTS", "5"))
    seat_claim_backoff_ms_base: int = int(os.getenv("SEAT_CLAIM_BACKOFF_MS_BASE", "10"))
    seat_claim_backoff_ms_max: int = int(os.getenv("SEAT_CLAIM_BACKOFF_MS_MAX", "200"))

    extra_password: Optional[str] = os.getenv("EXTRA_PASSWORD")
    # 可选：备用口令哈希（bcrypt），优先于明文 EXTRA_PASSWORD
    extra_password_hash: Optional[str] = os.getenv("EXTRA_PASSWORD_HASH")
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
    # 远程录号 Ingest API
    ingest_api_enabled: bool = os.getenv("INGEST_API_ENABLED", "false").lower() == "true"
    ingest_api_key: Optional[str] = os.getenv("INGEST_API_KEY")
    # 维护与同步
    maintenance_interval_seconds: int = int(os.getenv("MAINTENANCE_INTERVAL_SECONDS", "60"))
    invite_sync_days: int = int(os.getenv("INVITE_SYNC_DAYS", "30"))
    invite_sync_group_limit: int = int(os.getenv("INVITE_SYNC_GROUP_LIMIT", "20"))
    # 批量任务队列
    job_visibility_timeout_seconds: int = int(os.getenv("JOB_VISIBILITY_TIMEOUT_SECONDS", "300"))
    job_max_attempts: int = int(os.getenv("JOB_MAX_ATTEMPTS", "3"))
    # 数据库连接池（仅对非 SQLite 生效）
    db_pool_size: int = int(os.getenv("DB_POOL_SIZE", "20"))
    db_max_overflow: int = int(os.getenv("DB_MAX_OVERFLOW", "30"))
    db_pool_timeout: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    db_pool_recycle: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))

    @property
    def database_url(self) -> str:
        """获取数据库连接URL。
        优先使用 DATABASE_URL；否则回退到基于后端目录的绝对路径 SQLite（cloud/backend/data/app.db）。
        """
        if self.database_url_raw:
            return self.database_url_raw

        # 计算 cloud/backend 目录
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        default_db_path = os.path.join(base_dir, "data", "app.db")
        # 绝对路径SQLite：sqlite:////absolute/path
        return f"sqlite:///{default_db_path if default_db_path.startswith('/') else '/' + default_db_path}"

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
