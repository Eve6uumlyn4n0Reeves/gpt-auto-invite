"""
统一响应中间件。

自动处理响应格式，确保所有API返回统一的格式。
同时添加请求ID、时间戳等元数据。
"""

import time
import uuid
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.error_handler import ApiResponse


class UnifiedResponseMiddleware(BaseHTTPMiddleware):
    """统一响应格式中间件"""

    def __init__(self, app, add_request_id: bool = True, add_timing: bool = True):
        super().__init__(app)
        self.add_request_id = add_request_id
        self.add_timing = add_timing

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成请求ID
        if self.add_request_id:
            request_id = str(uuid.uuid4())
            request.state.request_id = request_id

        # 记录开始时间
        if self.add_timing:
            start_time = time.time()

        # 调用下一个中间件或路由处理器
        response = await call_next(request)

        # 只处理JSON响应
        if isinstance(response, JSONResponse):
            # 解析原有响应内容
            try:
                import json
                original_content = json.loads(response.body.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                original_content = None

            # 如果响应已经是标准格式，则不处理
            if isinstance(original_content, dict) and "success" in original_content:
                # 添加元数据
                if self.add_request_id:
                    original_content.setdefault("meta", {})["request_id"] = request_id

                if self.add_timing:
                    processing_time = time.time() - start_time
                    original_content.setdefault("meta", {})["processing_time_ms"] = round(processing_time * 1000, 2)

                # 更新响应
                response = JSONResponse(
                    content=original_content,
                    status_code=response.status_code,
                    headers=response.headers,
                )
            else:
                # 包装为标准格式
                success = 200 <= response.status_code < 400
                wrapped_content = ApiResponse.success(
                    data=original_content,
                    message="操作成功" if success else "操作失败",
                    meta={}
                )

                if self.add_request_id:
                    wrapped_content["meta"]["request_id"] = request_id

                if self.add_timing:
                    processing_time = time.time() - start_time
                    wrapped_content["meta"]["processing_time_ms"] = round(processing_time * 1000, 2)

                response = JSONResponse(
                    content=wrapped_content,
                    status_code=response.status_code,
                    headers=response.headers,
                )

        # 添加响应头
        if self.add_request_id:
            response.headers["X-Request-ID"] = getattr(request.state, "request_id", "")

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """安全头中间件"""

    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # 添加安全头
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # 在生产环境中添加HSTS
        from app.config import settings
        if settings.env == "prod":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""

    def __init__(self, app, log_level: str = "INFO"):
        super().__init__(app)
        import logging
        self.logger = logging.getLogger(f"{__name__}.RequestLogging")
        self.logger.setLevel(getattr(logging, log_level.upper()))

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        # 记录请求信息
        self.logger.info(
            f"Request started: {request.method} {request.url.path} - "
            f"Client: {request.client.host if request.client else 'unknown'} - "
            f"Request-ID: {getattr(request.state, 'request_id', 'unknown')}"
        )

        # 处理请求
        response = await call_next(request)

        # 记录响应信息
        processing_time = time.time() - start_time
        self.logger.info(
            f"Request completed: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {processing_time:.3f}s - "
            f"Request-ID: {getattr(request.state, 'request_id', 'unknown')}"
        )

        return response


class CorsMiddleware(BaseHTTPMiddleware):
    """CORS中间件（简化版）"""

    def __init__(
        self,
        app,
        allow_origins: list = None,
        allow_methods: list = None,
        allow_headers: list = None,
        allow_credentials: bool = True,
    ):
        super().__init__(app)
        self.allow_origins = allow_origins or ["*"]
        self.allow_methods = allow_methods or ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
        self.allow_headers = allow_headers or ["*"]
        self.allow_credentials = allow_credentials

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        origin = request.headers.get("origin")

        # 处理预检请求
        if request.method == "OPTIONS":
            response = Response()
        else:
            response = await call_next(request)

        # 添加CORS头
        if origin and (self.allow_origins == ["*"] or origin in self.allow_origins):
            response.headers["Access-Control-Allow-Origin"] = origin

        response.headers["Access-Control-Allow-Methods"] = ", ".join(self.allow_methods)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(self.allow_headers)

        if self.allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"

        return response


def setup_middleware(app):
    """
    为FastAPI应用设置所有中间件

    Args:
        app: FastAPI应用实例
    """
    from app.config import settings

    # 注意：中间件的顺序很重要，后添加的先执行

    # 1. 安全头中间件（最外层）
    app.add_middleware(SecurityHeadersMiddleware)

    # 2. CORS中间件
    if settings.env in ("dev", "development"):
        # 开发环境允许所有来源
        app.add_middleware(CorsMiddleware, allow_origins=["*"])
    else:
        # 生产环境需要配置具体来源
        allowed_origins = getattr(settings, 'cors_origins', [])
        app.add_middleware(CorsMiddleware, allow_origins=allowed_origins)

    # 3. 请求日志中间件
    app.add_middleware(RequestLoggingMiddleware, log_level="INFO")

    # 4. 统一响应中间件（最内层，靠近路由处理）
    app.add_middleware(UnifiedResponseMiddleware, add_request_id=True, add_timing=True)