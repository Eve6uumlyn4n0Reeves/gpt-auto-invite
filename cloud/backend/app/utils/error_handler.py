"""
统一错误处理和响应格式。

提供标准化的错误处理机制，确保API响应的一致性和可维护性。
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Union
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from pydantic import ValidationError

logger = logging.getLogger(__name__)


class ErrorCode:
    """错误代码枚举"""

    # 通用错误
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"

    # 业务错误
    MOTHER_NOT_FOUND = "MOTHER_NOT_FOUND"
    MOTHER_ALREADY_EXISTS = "MOTHER_ALREADY_EXISTS"
    MOTHER_INVALID_STATUS = "MOTHER_INVALID_STATUS"

    CHILD_ACCOUNT_NOT_FOUND = "CHILD_ACCOUNT_NOT_FOUND"
    CHILD_ACCOUNT_ALREADY_EXISTS = "CHILD_ACCOUNT_ALREADY_EXISTS"

    POOL_GROUP_NOT_FOUND = "POOL_GROUP_NOT_FOUND"
    POOL_GROUP_ALREADY_EXISTS = "POOL_GROUP_ALREADY_EXISTS"

    INVITE_NOT_FOUND = "INVITE_NOT_FOUND"
    REDEEM_CODE_NOT_FOUND = "REDEEM_CODE_NOT_FOUND"
    REDEEM_CODE_ALREADY_USED = "REDEEM_CODE_ALREADY_USED"

    BATCH_JOB_NOT_FOUND = "BATCH_JOB_NOT_FOUND"
    BATCH_JOB_FAILED = "BATCH_JOB_FAILED"

    # 数据库错误
    DATABASE_CONNECTION_ERROR = "DATABASE_CONNECTION_ERROR"
    DATABASE_INTEGRITY_ERROR = "DATABASE_INTEGRITY_ERROR"

    # Provider错误
    PROVIDER_API_ERROR = "PROVIDER_API_ERROR"
    PROVIDER_AUTH_ERROR = "PROVIDER_AUTH_ERROR"
    PROVIDER_RATE_LIMIT = "PROVIDER_RATE_LIMIT"


class BusinessError(Exception):
    """业务逻辑异常基类"""

    def __init__(
        self,
        message: str,
        error_code: str = ErrorCode.INTERNAL_SERVER_ERROR,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(BusinessError):
    """资源不存在错误"""

    def __init__(self, message: str, resource_type: str = "Resource", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code=ErrorCode.NOT_FOUND,
            status_code=status.HTTP_404_NOT_FOUND,
            details={**({"resource_type": resource_type}), **(details or {})}
        )


class ConflictError(BusinessError):
    """资源冲突错误"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code=ErrorCode.CONFLICT,
            status_code=status.HTTP_409_CONFLICT,
            details=details
        )


class ValidationError(BusinessError):
    """数据验证错误"""

    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_code=ErrorCode.VALIDATION_ERROR,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={**({"field": field} if field else {}), **(details or {})}
        )


class MotherNotFoundError(NotFoundError):
    """Mother账号不存在错误"""

    def __init__(self, mother_id: int):
        super().__init__(
            message=f"Mother账号 {mother_id} 不存在",
            resource_type="MotherAccount",
            details={"mother_id": mother_id}
        )


class MotherAlreadyExistsError(ConflictError):
    """Mother账号已存在错误"""

    def __init__(self, name: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Mother账号 {name} 已存在",
            details={"name": name, **(details or {})}
        )


class ChildAccountNotFoundError(NotFoundError):
    """子账号不存在错误"""

    def __init__(self, child_id: int):
        super().__init__(
            message=f"子账号 {child_id} 不存在",
            resource_type="ChildAccount",
            details={"child_id": child_id}
        )


class PoolGroupNotFoundError(NotFoundError):
    """号池组不存在错误"""

    def __init__(self, pool_group_id: int):
        super().__init__(
            message=f"号池组 {pool_group_id} 不存在",
            resource_type="PoolGroup",
            details={"pool_group_id": pool_group_id}
        )


class ProviderError(BusinessError):
    """Provider API错误"""

    def __init__(self, message: str, provider_status: Optional[int] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Provider API错误: {message}",
            error_code=ErrorCode.PROVIDER_API_ERROR,
            status_code=status.HTTP_502_BAD_GATEWAY,
            details={"provider_status": provider_status, **(details or {})}
        )


class ApiResponse:
    """标准API响应格式"""

    @staticmethod
    def success(
        data: Any = None,
        message: str = "操作成功",
        meta: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """成功响应格式"""
        response = {
            "success": True,
            "message": message,
            "data": data,
        }
        if meta:
            response["meta"] = meta
        return response

    @staticmethod
    def error(
        message: str,
        error_code: str = ErrorCode.INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    ) -> Dict[str, Any]:
        """错误响应格式"""
        return {
            "success": False,
            "error": {
                "code": error_code,
                "message": message,
                "details": details or {},
            },
        }

    @staticmethod
    def paginated(
        items: list,
        total: int,
        page: int,
        page_size: int,
        message: str = "查询成功"
    ) -> Dict[str, Any]:
        """分页响应格式"""
        total_pages = (total + page_size - 1) // page_size

        return ApiResponse.success(
            data=items,
            message=message,
            meta={
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1,
                }
            }
        )


def create_error_response(
    message: str,
    error_code: str = ErrorCode.INTERNAL_SERVER_ERROR,
    details: Optional[Dict[str, Any]] = None,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
) -> JSONResponse:
    """创建标准错误响应"""
    response_data = ApiResponse.error(
        message=message,
        error_code=error_code,
        details=details,
        status_code=status_code
    )

    return JSONResponse(
        status_code=status_code,
        content=response_data
    )


def create_success_response(
    data: Any = None,
    message: str = "操作成功",
    status_code: int = status.HTTP_200_OK,
    meta: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """创建标准成功响应"""
    response_data = ApiResponse.success(
        data=data,
        message=message,
        meta=meta
    )

    return JSONResponse(
        status_code=status_code,
        content=response_data
    )


def handle_business_error(exc: BusinessError) -> JSONResponse:
    """处理业务逻辑异常"""
    logger.warning(f"业务错误: {exc.error_code} - {exc.message}")

    return create_error_response(
        message=exc.message,
        error_code=exc.error_code,
        details=exc.details,
        status_code=exc.status_code
    )


def handle_validation_error(exc: RequestValidationError) -> JSONResponse:
    """处理FastAPI验证错误"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        })

    logger.warning(f"验证错误: {errors}")

    return create_error_response(
        message="请求数据验证失败",
        error_code=ErrorCode.VALIDATION_ERROR,
        details={"validation_errors": errors},
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


def handle_database_error(exc: SQLAlchemyError) -> JSONResponse:
    """处理数据库错误"""
    logger.error(f"数据库错误: {str(exc)}")

    if isinstance(exc, IntegrityError):
        # 检查是否是唯一约束冲突
        error_msg = str(exc.orig).lower() if hasattr(exc, 'orig') else str(exc).lower()
        if "unique" in error_msg or "duplicate" in error_msg:
            return create_error_response(
                message="数据已存在，违反唯一约束",
                error_code=ErrorCode.DATABASE_INTEGRITY_ERROR,
                status_code=status.HTTP_409_CONFLICT
            )

        return create_error_response(
            message="数据完整性错误",
            error_code=ErrorCode.DATABASE_INTEGRITY_ERROR,
            status_code=status.HTTP_400_BAD_REQUEST
        )

    return create_error_response(
        message="数据库操作失败",
        error_code=ErrorCode.DATABASE_CONNECTION_ERROR,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


def handle_http_exception(exc: HTTPException) -> JSONResponse:
    """处理HTTP异常"""
    logger.warning(f"HTTP异常: {exc.status_code} - {exc.detail}")

    # 根据状态码映射错误代码
    error_code_map = {
        400: ErrorCode.VALIDATION_ERROR,
        401: ErrorCode.UNAUTHORIZED,
        403: ErrorCode.FORBIDDEN,
        404: ErrorCode.NOT_FOUND,
        409: ErrorCode.CONFLICT,
    }

    error_code = error_code_map.get(exc.status_code, ErrorCode.INTERNAL_SERVER_ERROR)

    return create_error_response(
        message=str(exc.detail),
        error_code=error_code,
        status_code=exc.status_code
    )


def handle_generic_exception(exc: Exception) -> JSONResponse:
    """处理通用异常"""
    logger.error(f"未处理的异常: {type(exc).__name__} - {str(exc)}", exc_info=True)

    return create_error_response(
        message="服务器内部错误",
        error_code=ErrorCode.INTERNAL_SERVER_ERROR,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


# 异常处理器映射
EXCEPTION_HANDLERS = {
    BusinessError: handle_business_error,
    RequestValidationError: handle_validation_error,
    SQLAlchemyError: handle_database_error,
    HTTPException: handle_http_exception,
    Exception: handle_generic_exception,
}


def setup_exception_handlers(app):
    """
    为FastAPI应用设置异常处理器

    Args:
        app: FastAPI应用实例
    """
    for exc_type, handler in EXCEPTION_HANDLERS.items():
        app.add_exception_handler(exc_type, handler)


# 装饰器：简化错误处理
def handle_errors(func):
    """
    错误处理装饰器，自动捕获和转换异常

    Args:
        func: 要装饰的函数

    Returns:
        装饰后的函数
    """
    from functools import wraps

    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as exc:
            # 查找合适的异常处理器
            handler = None
            for exc_type, h in EXCEPTION_HANDLERS.items():
                if isinstance(exc, exc_type):
                    handler = h
                    break

            if handler:
                return handler(exc)
            else:
                return handle_generic_exception(exc)

    return wrapper