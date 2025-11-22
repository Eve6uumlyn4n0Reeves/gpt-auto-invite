"""
Pool API 认证中间件

验证 X-API-Key header 并记录请求日志。
"""
from typing import Callable, Optional
from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session

from ..database import SessionPool
from ..services.pool_api_key_service import APIKeyService
from ..utils.pool_logger import pool_logger, PoolAction, PoolStatus, generate_request_id


class PoolAPIAuthMiddleware(BaseHTTPMiddleware):
    """
    Pool API 认证中间件
    
    拦截所有 /pool/* 路径的请求，验证 X-API-Key header。
    """
    
    def __init__(self, app, pool_api_prefix: str = "/pool"):
        super().__init__(app)
        self.pool_api_prefix = pool_api_prefix
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """处理请求"""
        # 只拦截 Pool API 路径
        if not request.url.path.startswith(self.pool_api_prefix):
            return await call_next(request)
        
        # 生成请求ID
        request_id = generate_request_id()
        request.state.request_id = request_id
        
        # 提取 API Key
        api_key = request.headers.get("X-API-Key")
        
        if not api_key:
            pool_logger.log_event(
                PoolAction.API_REQUEST,
                PoolStatus.FAILED,
                request_id=request_id,
                error_code="MISSING_API_KEY",
                error_message="X-API-Key header is required",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                },
            )
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "ok": False,
                    "error": "MISSING_API_KEY",
                    "message": "X-API-Key header is required",
                },
            )
        
        # 验证 API Key
        db: Session = SessionPool()
        try:
            api_key_obj = APIKeyService.validate_api_key(db, api_key)
            
            if not api_key_obj:
                pool_logger.log_event(
                    PoolAction.API_REQUEST,
                    PoolStatus.FAILED,
                    request_id=request_id,
                    error_code="INVALID_API_KEY",
                    error_message="Invalid or inactive API key",
                    extra={
                        "path": request.url.path,
                        "method": request.method,
                    },
                )
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "ok": False,
                        "error": "INVALID_API_KEY",
                        "message": "Invalid or inactive API key",
                    },
                )
            
            # 验证成功，记录到 request.state
            request.state.api_key_id = api_key_obj.id
            request.state.api_key_name = api_key_obj.name
            
            # 记录请求日志
            pool_logger.log_event(
                PoolAction.API_REQUEST,
                PoolStatus.OK,
                request_id=request_id,
                api_key_id=str(api_key_obj.id),
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "api_key_name": api_key_obj.name,
                },
            )
            
            # 继续处理请求
            response = await call_next(request)
            
            # 记录响应日志
            pool_logger.log_event(
                PoolAction.API_RESPONSE,
                PoolStatus.OK,
                request_id=request_id,
                api_key_id=str(api_key_obj.id),
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                },
            )
            
            return response
            
        except Exception as e:
            pool_logger.log_event(
                PoolAction.API_REQUEST,
                PoolStatus.FAILED,
                request_id=request_id,
                error_code="INTERNAL_ERROR",
                error_message=str(e),
                extra={
                    "path": request.url.path,
                    "method": request.method,
                },
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "ok": False,
                    "error": "INTERNAL_ERROR",
                    "message": "Internal server error during authentication",
                },
            )
        finally:
            db.close()


def get_request_id(request: Request) -> Optional[str]:
    """从 request.state 获取请求ID"""
    return getattr(request.state, "request_id", None)


def get_api_key_id(request: Request) -> Optional[int]:
    """从 request.state 获取 API Key ID"""
    return getattr(request.state, "api_key_id", None)


def get_api_key_name(request: Request) -> Optional[str]:
    """从 request.state 获取 API Key 名称"""
    return getattr(request.state, "api_key_name", None)

