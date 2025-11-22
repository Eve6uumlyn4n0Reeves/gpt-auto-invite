"""
Pool Provider 包装器

对 provider.py 的方法进行包装，添加重试机制和日志记录。
"""
import time
from typing import Optional

from ..provider import (
    send_invite,
    delete_member,
    list_members,
    update_team_info,
    ProviderError,
)
from ..utils.pool_retry import retry_with_backoff, RetryResult
from ..utils.pool_logger import pool_logger, PoolStatus
from ..config import pool_config


class PoolProviderWrapper:
    """
    Provider 包装器
    
    为 Pool API 提供统一的 Provider 调用接口，集成重试和日志。
    """
    
    @staticmethod
    def list_team_members(
        access_token: str,
        team_id: str,
        *,
        request_id: Optional[str] = None,
    ) -> list[dict]:
        """
        列出团队成员（自动分页获取全部）
        
        Args:
            access_token: 访问令牌
            team_id: 团队ID（workspace_id）
            request_id: 请求ID（用于日志）
            
        Returns:
            成员列表 [{"id": "...", "email": "...", ...}, ...]
            
        Raises:
            ProviderError: Provider 错误
        """
        all_members = []
        offset = 0
        limit = 100
        
        while True:
            result = retry_with_backoff(
                lambda: list_members(access_token, team_id, offset=offset, limit=limit),
                max_attempts=pool_config.retry_attempts,
                backoff_ms=pool_config.retry_backoff_ms,
            )
            
            if not result.success:
                raise result.error or Exception("Unknown error in list_members")
            
            data = result.data or {}
            members = data.get("data", [])
            all_members.extend(members)
            
            # 检查是否还有更多数据
            if len(members) < limit:
                break
            
            offset += limit
        
        return all_members
    
    @staticmethod
    def kick_member(
        access_token: str,
        team_id: str,
        member_id: str,
        email: str,
        *,
        request_id: Optional[str] = None,
    ) -> RetryResult:
        """
        踢出成员（带重试）
        
        Args:
            access_token: 访问令牌
            team_id: 团队ID
            member_id: 成员ID
            email: 成员邮箱（用于日志）
            request_id: 请求ID
            
        Returns:
            RetryResult
        """
        start_time = time.time()
        
        def on_retry(attempt: int, error: Exception):
            pool_logger.log_kick(
                team_id=team_id,
                email=email,
                status=PoolStatus.RETRYING,
                attempt=attempt,
                error_code=type(error).__name__,
                error_message=str(error),
            )
        
        result = retry_with_backoff(
            lambda: delete_member(access_token, team_id, member_id),
            max_attempts=pool_config.retry_attempts,
            backoff_ms=pool_config.retry_backoff_ms,
            on_retry=on_retry,
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        # 记录最终结果
        if result.success:
            pool_logger.log_kick(
                team_id=team_id,
                email=email,
                status=PoolStatus.OK,
                attempt=result.attempts,
                latency_ms=latency_ms,
            )
        else:
            error = result.error
            pool_logger.log_kick(
                team_id=team_id,
                email=email,
                status=PoolStatus.FAILED,
                attempt=result.attempts,
                latency_ms=latency_ms,
                error_code=type(error).__name__ if error else "UNKNOWN",
                error_message=str(error) if error else "Unknown error",
                provider_status=error.args[0] if isinstance(error, ProviderError) and error.args else None,
            )
        
        return result
    
    @staticmethod
    def invite_member(
        access_token: str,
        team_id: str,
        email: str,
        *,
        request_id: Optional[str] = None,
    ) -> RetryResult:
        """
        邀请成员（带重试）
        
        Args:
            access_token: 访问令牌
            team_id: 团队ID
            email: 成员邮箱
            request_id: 请求ID
            
        Returns:
            RetryResult
        """
        start_time = time.time()
        
        def on_retry(attempt: int, error: Exception):
            pool_logger.log_invite(
                team_id=team_id,
                email=email,
                status=PoolStatus.RETRYING,
                attempt=attempt,
                error_code=type(error).__name__,
                error_message=str(error),
            )
        
        result = retry_with_backoff(
            lambda: send_invite(access_token, team_id, email),
            max_attempts=pool_config.retry_attempts,
            backoff_ms=pool_config.retry_backoff_ms,
            on_retry=on_retry,
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        # 记录最终结果
        if result.success:
            pool_logger.log_invite(
                team_id=team_id,
                email=email,
                status=PoolStatus.OK,
                attempt=result.attempts,
                latency_ms=latency_ms,
            )
        else:
            error = result.error
            pool_logger.log_invite(
                team_id=team_id,
                email=email,
                status=PoolStatus.FAILED,
                attempt=result.attempts,
                latency_ms=latency_ms,
                error_code=type(error).__name__ if error else "UNKNOWN",
                error_message=str(error) if error else "Unknown error",
                provider_status=error.args[0] if isinstance(error, ProviderError) and error.args else None,
            )
        
        return result
    
    @staticmethod
    def rename_team(
        access_token: str,
        team_id: str,
        new_name: str,
        *,
        request_id: Optional[str] = None,
    ) -> RetryResult:
        """
        重命名团队（带重试）
        
        Args:
            access_token: 访问令牌
            team_id: 团队ID
            new_name: 新名称
            request_id: 请求ID
            
        Returns:
            RetryResult
        """
        result = retry_with_backoff(
            lambda: update_team_info(access_token, team_id, new_name),
            max_attempts=pool_config.retry_attempts,
            backoff_ms=pool_config.retry_backoff_ms,
        )
        
        return result

