"""
CSRF Token 工具模块
"""
import time
from typing import Optional
from fastapi import Request
from itsdangerous import URLSafeTimedSerializer, BadSignature
from app.config import settings
from app.security import verify_session, unsign_session

# 创建CSRF token序列化器
csrf_serializer = URLSafeTimedSerializer(
    settings.secret_key,
    salt="csrf-token-salt"
)

class CSRFTokenManager:
    """CSRF Token管理器"""

    @staticmethod
    def generate_token(session_id: str) -> str:
        """生成CSRF token"""
        timestamp = int(time.time())
        data = f"{session_id}:{timestamp}"
        return csrf_serializer.dumps(data)

    @staticmethod
    def validate_token(token: str, session_id: str, max_age: int = 3600) -> bool:
        """验证CSRF token"""
        try:
            data = csrf_serializer.loads(token, max_age=max_age)
            expected_session_id, timestamp = data.split(":", 1)

            # 检查session ID是否匹配
            if expected_session_id != session_id:
                return False

            return True
        except (BadSignature, ValueError, IndexError):
            return False

    @staticmethod
    async def extract_token_from_request(request: Request) -> Optional[str]:
        """从请求中提取CSRF token"""
        # 1. 从Header中获取
        token = request.headers.get("X-CSRF-Token")
        if token:
            return token

        # 2. 从Form中获取
        if request.method in ("POST", "PUT", "PATCH"):
            try:
                form_data = await request.form()
                token = form_data.get("csrf_token")
                if token:
                    return token
            except Exception:
                pass

        # 3. 从JSON body中获取
        try:
            json_data = await request.json()
            if isinstance(json_data, dict):
                token = json_data.get("csrf_token")
                if token:
                    return token
        except Exception:
            pass

        return None

    @staticmethod
    def get_session_id_from_request(request: Request) -> Optional[str]:
        """从请求中获取session ID"""
        # 从cookie中获取session
        session_cookie = request.cookies.get("admin_session")
        if not session_cookie:
            return None

        if not verify_session(session_cookie, max_age_seconds=settings.admin_session_ttl_seconds):
            return None

        sid = unsign_session(session_cookie, max_age_seconds=settings.admin_session_ttl_seconds)
        if not sid:
            return None

        return sid

# CSRF Token校验依赖
async def require_csrf_token(request: Request) -> None:
    """强制校验 CSRF：从请求中提取 token，并与会话绑定校验。"""
    token = await CSRFTokenManager.extract_token_from_request(request)
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="缺少CSRF Token")

    session_id = CSRFTokenManager.get_session_id_from_request(request)
    if not session_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="未认证")

    ok = CSRFTokenManager.validate_token(token, session_id)
    if not ok:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="CSRF校验失败")

def generate_csrf_token_for_session(session_id: str) -> str:
    """为指定session生成CSRF token"""
    return CSRFTokenManager.generate_token(session_id)
