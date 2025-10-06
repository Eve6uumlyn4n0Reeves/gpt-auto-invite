import base64
import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")
    http_proxy: str | None = os.getenv("HTTP_PROXY")
    https_proxy: str | None = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    admin_session_ttl_seconds: int = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
    # 默认母号 token 过期逻辑：若上游未提供 expires，则按该天数回退
    token_default_ttl_days: int = int(os.getenv("TOKEN_DEFAULT_TTL_DAYS", "40"))

    extra_password: str | None = os.getenv("EXTRA_PASSWORD")
    extra_password_start_at_raw: str | None = os.getenv("EXTRA_PASSWORD_START_AT")

    max_login_attempts: int = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
    login_lockout_duration: int = int(os.getenv("LOGIN_LOCKOUT_DURATION", "300"))  # 5分钟
    session_timeout_warning: int = int(os.getenv("SESSION_TIMEOUT_WARNING", "300"))  # 会话到期前提示秒数

    @property
    def encryption_key(self) -> bytes:
        if not self.encryption_key_b64:
            # 生产环境必须提供密钥；本地开发回退到固定值以避免启动失败（不安全，仅本地）
            return b"0" * 32
        try:
            key = base64.b64decode(self.encryption_key_b64)
            if len(key) != 32:
                raise ValueError("ENCRYPTION_KEY must be 32 bytes base64")
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


settings = Settings()
