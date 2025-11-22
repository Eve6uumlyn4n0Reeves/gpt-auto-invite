"""
Pool API 错误处理

统一的错误处理和响应格式化。
"""
from typing import Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..schemas.pool_schemas import ErrorResponse


def create_error_response(
    error_code: str,
    message: str,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    details: Optional[dict] = None,
) -> JSONResponse:
    """
    创建统一的错误响应
    
    Args:
        error_code: 错误代码
        message: 错误消息
        status_code: HTTP状态码
        details: 详细信息
        
    Returns:
        JSONResponse
    """
    error_response = ErrorResponse(
        ok=False,
        error=error_code,
        message=message,
        details=details,
    )
    
    return JSONResponse(
        status_code=status_code,
        content=error_response.model_dump(),
    )


async def pool_http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """处理 HTTP 异常"""
    return create_error_response(
        error_code="HTTP_ERROR",
        message=str(exc.detail),
        status_code=exc.status_code,
    )


async def pool_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """处理请求验证异常"""
    return create_error_response(
        error_code="VALIDATION_ERROR",
        message="Request validation failed",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        details={"errors": exc.errors()},
    )


async def pool_generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理通用异常"""
    return create_error_response(
        error_code="INTERNAL_ERROR",
        message="Internal server error",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        details={"exception": str(exc)},
    )

