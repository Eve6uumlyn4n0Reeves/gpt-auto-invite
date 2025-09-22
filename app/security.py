import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from passlib.hash import bcrypt
from itsdangerous import TimestampSigner, BadSignature
from app.config import settings


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
