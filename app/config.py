import base64
import os
from dataclasses import dataclass


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data.db")
    encryption_key_b64: str = os.getenv("ENCRYPTION_KEY", "")
    admin_initial_password: str = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")
    http_proxy: str | None = os.getenv("HTTP_PROXY")
    https_proxy: str | None = os.getenv("HTTPS_PROXY")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-secret-key")
    env: str = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    admin_session_ttl_seconds: int = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 3600)))

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


settings = Settings()
