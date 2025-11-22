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
    # 双库（可选）：用户组库与号池库
    database_url_users_raw: str = os.getenv("DATABASE_URL_USERS", "")
    database_url_pool_raw: str = os.getenv("DATABASE_URL_POOL", "")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "admin123")
    http_proxy: Optional[str] = os.getenv("HTTP_PROXY")
    https_proxy: Optional[str] = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    # Migration toggles
    mother_group_migration_phase: str = os.getenv("MOTHER_GROUP_MIGRATION_PHASE", "pre")
    strict_session_asserts: bool = os.getenv("STRICT_SESSION_ASSERTS", "false").lower() == "true"
    strict_domain_guard: bool = os.getenv("STRICT_DOMAIN_GUARD", "false").lower() == "true"

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
    mother_health_check_batch_size: int = int(os.getenv("MOTHER_HEALTH_CHECK_BATCH", "5"))
    # 批量任务队列
    job_visibility_timeout_seconds: int = int(os.getenv("JOB_VISIBILITY_TIMEOUT_SECONDS", "300"))
    job_max_attempts: int = int(os.getenv("JOB_MAX_ATTEMPTS", "3"))
    # 兑换码生命周期与切换
    code_default_lifecycle_plan: str = os.getenv("CODE_DEFAULT_LIFECYCLE_PLAN", "monthly").lower()
    code_lifecycle_weekly_days: int = int(os.getenv("CODE_LIFECYCLE_WEEKLY_DAYS", "7"))
    code_lifecycle_monthly_days: int = int(os.getenv("CODE_LIFECYCLE_MONTHLY_DAYS", "30"))
    code_default_switch_limit: int = int(os.getenv("CODE_DEFAULT_SWITCH_LIMIT", "3"))
    code_refresh_cooldown_seconds: int = int(os.getenv("CODE_REFRESH_COOLDOWN_SECONDS", "1800"))
    code_refresh_recent_team_days: int = int(os.getenv("CODE_REFRESH_RECENT_TEAM_DAYS", "30"))
    # 数据库连接池（仅对非 SQLite 生效）
    db_pool_size: int = int(os.getenv("DB_POOL_SIZE", "20"))
    db_max_overflow: int = int(os.getenv("DB_MAX_OVERFLOW", "30"))
    db_pool_timeout: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    db_pool_recycle: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))

    # 号池组与子号邮箱域名（可配置，不要写死）
    child_email_domain: Optional[str] = os.getenv("CHILD_EMAIL_DOMAIN")
    pool_auto_invite_missing: bool = os.getenv("POOL_AUTO_INVITE_MISSING", "false").lower() == "true"

    # Pool API 配置
    pool_api_key: Optional[str] = os.getenv("POOL_API_KEY")
    pool_concurrency: int = int(os.getenv("POOL_CONCURRENCY", "5"))
    pool_retry_attempts: int = int(os.getenv("POOL_RETRY_ATTEMPTS", "3"))
    pool_retry_backoff_base_ms: int = int(os.getenv("POOL_RETRY_BACKOFF_BASE_MS", "500"))
    pool_retry_backoff_multiplier: float = float(os.getenv("POOL_RETRY_BACKOFF_MULTIPLIER", "2.0"))
    pool_log_retention_days: int = int(os.getenv("POOL_LOG_RETENTION_DAYS", "30"))
    capacity_guard_enabled: bool = os.getenv("CAPACITY_GUARD_ENABLED", "true").lower() == "true"
    capacity_warn_threshold: int = int(os.getenv("CAPACITY_WARN_THRESHOLD", "20"))
    mother_health_alive_grace_minutes: int = int(os.getenv("MOTHER_HEALTH_ALIVE_GRACE_MINUTES", "120"))

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
    def database_url_users(self) -> str:
        """用户组链路数据库URL（若未配置则回退到单库URL）。"""
        return self.database_url_users_raw or self.database_url

    @property
    def database_url_pool(self) -> str:
        """号池链路数据库URL（若未配置则回退到单库URL）。"""
        return self.database_url_pool_raw or self.database_url

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

    @property
    def pool_retry_backoff_sequence_ms(self) -> list[int]:
        """生成重试退避序列（毫秒）：[500, 1000, 2000] 默认"""
        sequence = []
        current = self.pool_retry_backoff_base_ms
        for _ in range(self.pool_retry_attempts):
            sequence.append(current)
            current = int(current * self.pool_retry_backoff_multiplier)
        return sequence

    def resolve_lifecycle_plan(self, plan: Optional[str]) -> str:
        value = (plan or self.code_default_lifecycle_plan or "monthly").lower()
        if value not in {"weekly", "monthly"}:
            return "monthly"
        return value

    def lifecycle_duration_days(self, plan: str) -> int:
        normalized = plan.lower()
        if normalized == "weekly":
            return max(1, self.code_lifecycle_weekly_days)
        if normalized == "monthly":
            return max(1, self.code_lifecycle_monthly_days)
        return max(1, self.code_lifecycle_monthly_days)


@dataclass
class PoolConfig:
    """Pool侧专用配置（从Settings派生）"""
    api_key: Optional[str]
    concurrency: int
    retry_attempts: int
    retry_backoff_ms: list[int]
    log_retention_days: int

    @classmethod
    def from_settings(cls, settings: Settings) -> "PoolConfig":
        return cls(
            api_key=settings.pool_api_key,
            concurrency=settings.pool_concurrency,
            retry_attempts=settings.pool_retry_attempts,
            retry_backoff_ms=settings.pool_retry_backoff_sequence_ms,
            log_retention_days=settings.pool_log_retention_days,
        )

    def validate(self) -> None:
        """配置校验"""
        if self.concurrency < 1:
            raise ValueError("pool_concurrency must be >= 1")
        if self.retry_attempts < 0:
            raise ValueError("pool_retry_attempts must be >= 0")
        if self.log_retention_days < 1:
            raise ValueError("pool_log_retention_days must be >= 1")
        if any(ms < 0 for ms in self.retry_backoff_ms):
            raise ValueError("pool_retry_backoff_ms must all be >= 0")


settings = Settings()
pool_config = PoolConfig.from_settings(settings)
pool_config.validate()
