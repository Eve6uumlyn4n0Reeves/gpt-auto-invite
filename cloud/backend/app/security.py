import base64
import os
import time
from typing import Dict, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from passlib.hash import bcrypt
from itsdangerous import TimestampSigner, BadSignature
from app.config import settings

_login_attempts: Dict[str, list] = {}

def encrypt_token(plaintext: str) -> str:
    key = settings.encryption_key
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("utf-8")

def decrypt_token(token_b64: str) -> str:
    key = settings.encryption_key
    raw = base64.b64decode(token_b64)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    pt = aesgcm.decrypt(nonce, ct, None)
    return pt.decode("utf-8")

def hash_password(password: str) -> str:
    return bcrypt.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.verify(password, hashed)
    except Exception:
        return False

def check_login_attempts(ip: str) -> bool:
    """检查IP是否被锁定"""
    current_time = time.time()
    if ip not in _login_attempts:
        return True
    
    # 清理过期的尝试记录
    _login_attempts[ip] = [
        attempt_time for attempt_time in _login_attempts[ip]
        if current_time - attempt_time < settings.login_lockout_duration
    ]
    
    return len(_login_attempts[ip]) < settings.max_login_attempts

def record_login_attempt(ip: str, success: bool) -> None:
    """记录登录尝试"""
    current_time = time.time()
    
    if success:
        # 成功登录，清除该IP的失败记录
        if ip in _login_attempts:
            del _login_attempts[ip]
    else:
        # 失败登录，记录时间
        if ip not in _login_attempts:
            _login_attempts[ip] = []
        _login_attempts[ip].append(current_time)

def get_lockout_remaining(ip: str) -> int:
    """获取剩余锁定时间（秒）"""
    if ip not in _login_attempts or not _login_attempts[ip]:
        return 0
    
    current_time = time.time()
    oldest_attempt = min(_login_attempts[ip])
    remaining = settings.login_lockout_duration - (current_time - oldest_attempt)
    return max(0, int(remaining))

def verify_admin_password(password: str, stored_hash: str) -> bool:
    """验证管理员密码：仅支持主密码哈希，或显式配置的额外密码（可选）。"""
    # 首先检查主密码哈希
    if verify_password(password, stored_hash):
        return True

    # 额外密码（如临时应急口令），仅当显式配置且到达生效时间
    try:
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    except Exception:
        now = __import__("datetime").datetime.utcnow()

    if (
        settings.extra_password
        and password == settings.extra_password
        and now >= settings.extra_password_start_at
    ):
        return True

    return False

_signer = TimestampSigner(settings.secret_key)

def sign_session(payload: str) -> str:
    # payload example: session id or "admin"
    return _signer.sign(payload).decode("utf-8")

def verify_session(signed: str, max_age_seconds: int = 7 * 24 * 3600) -> bool:
    try:
        _signer.unsign(signed, max_age=max_age_seconds)
        return True
    except BadSignature:
        return False

def unsign_session(signed: str, max_age_seconds: int = 7 * 24 * 3600) -> str | None:
    try:
        val = _signer.unsign(signed, max_age=max_age_seconds)
        return val.decode("utf-8") if isinstance(val, (bytes, bytearray)) else str(val)
    except BadSignature:
        return None

def generate_nonce() -> str:
    """生成CSP nonce"""
    return base64.b64encode(os.urandom(16)).decode('utf-8')

def get_security_headers(nonce: Optional[str] = None) -> Dict[str, str]:
    """生成安全HTTP头部"""
    # 构建CSP策略，移除unsafe-inline，使用nonce
    script_src = "'self'"
    style_src = "'self'"

    if nonce:
        script_src += f" 'nonce-{nonce}'"
        style_src += f" 'nonce-{nonce}'"

    csp_policy = (
        f"default-src 'self'; "
        f"script-src {script_src}; "
        f"style-src {style_src}; "
        f"img-src 'self' data: blob:; "
        f"font-src 'self' data:; "
        f"connect-src 'self'; "
        f"frame-ancestors 'none'; "
        f"base-uri 'self'; "
        f"form-action 'self'; "
        f"upgrade-insecure-requests"
    )

    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "Content-Security-Policy": csp_policy,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
    }
