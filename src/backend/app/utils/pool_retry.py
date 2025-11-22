"""
Pool 重试机制

提供指数退避重试功能，支持错误分类和智能重试。
"""
import time
from typing import Callable, TypeVar, Optional, Any
from dataclasses import dataclass
from enum import Enum

from ..config import pool_config
from ..provider import ProviderError


T = TypeVar('T')


class ErrorCategory(str, Enum):
    """错误分类"""
    RETRYABLE = "retryable"  # 可重试（429, 5xx）
    NON_RETRYABLE = "non_retryable"  # 不可重试（403, 404）
    UNKNOWN = "unknown"  # 未知错误


@dataclass
class RetryResult:
    """重试结果"""
    success: bool
    data: Any = None
    error: Optional[Exception] = None
    attempts: int = 0
    category: ErrorCategory = ErrorCategory.UNKNOWN
    
    @property
    def is_retryable_error(self) -> bool:
        return self.category == ErrorCategory.RETRYABLE


def classify_error(error: Exception) -> ErrorCategory:
    """
    分类错误

    Args:
        error: 异常对象

    Returns:
        ErrorCategory
    """
    if isinstance(error, ProviderError):
        # ProviderError 的 status 属性是 int
        status = error.status if hasattr(error, 'status') else 0

        # 429 Too Many Requests, 5xx Server Error - 可重试
        if status == 429 or (500 <= status < 600):
            return ErrorCategory.RETRYABLE

        # 403 Forbidden, 404 Not Found - 不可重试
        if status in (403, 404):
            return ErrorCategory.NON_RETRYABLE

    # 其他错误默认可重试
    return ErrorCategory.RETRYABLE


def retry_with_backoff(
    fn: Callable[[], T],
    max_attempts: Optional[int] = None,
    backoff_ms: Optional[list[int]] = None,
    on_retry: Optional[Callable[[int, Exception], None]] = None,
) -> RetryResult:
    """
    带指数退避的重试
    
    Args:
        fn: 要执行的函数
        max_attempts: 最大尝试次数（默认从 pool_config 读取）
        backoff_ms: 退避序列（毫秒），默认从 pool_config 读取
        on_retry: 重试回调函数 (attempt, error) -> None
        
    Returns:
        RetryResult
    """
    max_attempts = max_attempts or pool_config.retry_attempts
    backoff_ms = backoff_ms or pool_config.retry_backoff_ms
    
    last_error: Exception | None = None
    last_category = ErrorCategory.UNKNOWN
    
    for attempt in range(1, max_attempts + 1):
        try:
            result = fn()
            return RetryResult(
                success=True,
                data=result,
                attempts=attempt,
            )
        except Exception as e:
            last_error = e
            last_category = classify_error(e)
            
            # 如果是不可重试的错误，直接返回
            if last_category == ErrorCategory.NON_RETRYABLE:
                return RetryResult(
                    success=False,
                    error=e,
                    attempts=attempt,
                    category=last_category,
                )
            
            # 如果还有重试机会，等待后重试
            if attempt < max_attempts:
                # 计算退避时间
                backoff_index = min(attempt - 1, len(backoff_ms) - 1)
                wait_ms = backoff_ms[backoff_index]
                
                # 调用重试回调
                if on_retry:
                    on_retry(attempt, e)
                
                # 等待
                time.sleep(wait_ms / 1000.0)
    
    # 所有尝试都失败
    return RetryResult(
        success=False,
        error=last_error,
        attempts=max_attempts,
        category=last_category,
    )


def retry_async_with_backoff(
    fn: Callable[[], T],
    max_attempts: Optional[int] = None,
    backoff_ms: Optional[list[int]] = None,
    on_retry: Optional[Callable[[int, Exception], None]] = None,
) -> RetryResult:
    """
    异步版本的重试（暂时使用同步实现）
    
    TODO: 如果需要真正的异步重试，可以使用 asyncio.sleep
    """
    return retry_with_backoff(fn, max_attempts, backoff_ms, on_retry)

