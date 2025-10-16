"""
安全中间件模块
"""
from typing import Callable, Iterable, Optional, Set
from urllib.parse import urlparse
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from app.security import get_security_headers, generate_nonce
import logging

logger = logging.getLogger(__name__)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """安全头部中间件"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成nonce用于此请求的CSP
        nonce = generate_nonce()

        # 获取响应
        response = await call_next(request)

        # 添加安全头部
        security_headers = get_security_headers(nonce)
        for header, value in security_headers.items():
            response.headers[header] = value

        # 将nonce添加到响应状态，以便前端模板使用
        response.headers["X-CSP-Nonce"] = nonce

        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF防护中间件"""

    def __init__(
        self,
        app: ASGIApp,
        excluded_paths: Optional[list[str]] = None,
        allowed_origins: Optional[Iterable[str]] = None,
    ):
        super().__init__(app)
        self.excluded_paths = excluded_paths or ['/api/public/', '/api/health', '/docs', '/openapi.json']
        self.allowed_origins: Set[str] = {
            origin for origin in (self._normalize_origin(o) for o in (allowed_origins or [])) if origin
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 对于GET请求和排除的路径，跳过CSRF检查
        if request.method.upper() == 'GET':
            return await call_next(request)

        # 检查是否为排除的路径
        for path in self.excluded_paths:
            if request.url.path.startswith(path):
                return await call_next(request)

        # 检查Origin和Referer头
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")

        # 获取当前请求的主机
        host = request.headers.get("Host", "")
        scheme = "https" if request.url.scheme == "https" else "http"
        expected_origin = f"{scheme}://{host}"

        # 验证Origin或Referer
        expected_origin = self._normalize_origin(f"{scheme}://{host}") or ""
        allowed_origins = set(self.allowed_origins)
        if expected_origin:
            allowed_origins.add(expected_origin)

        if origin:
            if not self._is_allowed_origin(origin, allowed_origins):
                logger.warning(f"CSRF attempt blocked - Origin mismatch: {origin} not in {allowed_origins}")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"}
                )
        elif referer:
            if not self._is_allowed_origin(referer, allowed_origins):
                logger.warning(f"CSRF attempt blocked - Referer mismatch: {referer} not in {allowed_origins}")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"}
                )
        else:
            # 对于可能来自浏览器的请求，没有Origin/Referer头时拒绝
            user_agent = request.headers.get("User-Agent", "")
            if self._is_browser(user_agent):
                logger.warning("CSRF attempt blocked - Missing Origin/Referer headers")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"}
                )

        return await call_next(request)

    def _normalize_origin(self, url: str) -> Optional[str]:
        """规范化 Origin/Referer 为 scheme://host"""
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return None
            return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
        except Exception:
            return None

    def _is_allowed_origin(self, url: str, allowed_origins: Set[str]) -> bool:
        """检查是否为允许的来源"""
        normalized = self._normalize_origin(url)
        return bool(normalized and normalized in allowed_origins)

    def _is_browser(self, user_agent: str) -> bool:
        """简单判断是否为浏览器请求"""
        browser_indicators = [
            "Mozilla", "Chrome", "Safari", "Firefox", "Edge", "Opera",
            "WebKit", "Gecko", "Trident"
        ]
        return any(indicator in user_agent for indicator in browser_indicators)


class InputValidationMiddleware(BaseHTTPMiddleware):
    """输入验证中间件"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 检查请求头中的恶意内容
        suspicious_headers = []
        for header_name, header_value in request.headers.items():
            if self._contains_suspicious_content(str(header_value)):
                suspicious_headers.append(header_name)

        if suspicious_headers:
            logger.warning(f"Suspicious content in headers: {suspicious_headers}")
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid request headers"}
            )

        # 对于POST/PUT请求，检查内容类型
        if request.method.upper() in ['POST', 'PUT', 'PATCH']:
            content_type = request.headers.get("content-type", "")
            if not self._is_valid_content_type(content_type, request.url.path):
                logger.warning(f"Invalid content type for path {request.url.path}: {content_type}")
                return JSONResponse(
                    status_code=415,
                    content={"detail": "Unsupported Media Type"}
                )

        return await call_next(request)

    def _contains_suspicious_content(self, content: str) -> bool:
        """检查是否包含可疑内容"""
        suspicious_patterns = [
            '<script', 'javascript:', 'vbscript:', 'onload=', 'onerror=',
            'eval(', 'alert(', 'confirm(', 'prompt(',
            '../../', '..\\', 'sqlinject', 'union select'
        ]
        content_lower = content.lower()
        return any(pattern in content_lower for pattern in suspicious_patterns)

    def _is_valid_content_type(self, content_type: str, path: str) -> bool:
        """检查内容类型是否有效"""
        allowed_types = [
            'application/json',
            'application/x-www-form-urlencoded',
            'multipart/form-data',
            'text/plain'
        ]

        # 对于API路径，通常期望JSON
        if path.startswith('/api/'):
            return content_type.startswith('application/json') or 'multipart/form-data' in content_type

        # 检查是否为允许的类型
        return any(allowed_type in content_type for allowed_type in allowed_types)
