import base64
import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data.db")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    # Default admin password (for first-time login)
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "jyj040616")
    http_proxy: str | None = os.getenv("HTTP_PROXY")
    https_proxy: str | None = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    admin_session_ttl_seconds: int = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))
    # Optional extra password support (e.g., enabled after a certain time)
    # For safety, default to None; set via env only if explicitly needed.
    extra_password: str | None = os.getenv("EXTRA_PASSWORD")
    extra_password_start_at_raw: str | None = os.getenv("EXTRA_PASSWORD_START_AT")

    @property
    def encryption_key(self) -> bytes:
        if not self.encryption_key_b64:
            # In production, require explicit key
            # For local dev, fallback to deterministic (not secure) key to avoid startup failure
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
        # Parse ISO8601; default = now + 2 days ("后天") if not provided
        from datetime import datetime, timedelta, timezone
        raw = self.extra_password_start_at_raw
        if not raw:
            return datetime.now(timezone.utc) + timedelta(days=2)
        try:
            # Accept both with/without Z
            s = raw.replace("Z", "+00:00")
            return datetime.fromisoformat(s)
        except Exception:
            # Fallback to now to avoid locking out
            return datetime.now(timezone.utc)


settings = Settings()
