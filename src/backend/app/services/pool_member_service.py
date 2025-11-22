"""
Pool 成员管理服务

提供团队成员的列表、踢出、邀请等操作。
"""
import asyncio
from typing import Optional
from dataclasses import dataclass

from .pool_provider_wrapper import PoolProviderWrapper
from ..utils.pool_executor import ConcurrentExecutor, TaskResult
from ..utils.pool_retry import RetryResult
from ..config import pool_config


@dataclass
class MemberInfo:
    """成员信息"""
    member_id: str
    email: str
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


@dataclass
class OperationResult:
    """操作结果"""
    email: str
    success: bool
    error: Optional[str] = None
    attempts: int = 0


class PoolMemberService:
    """Pool 成员管理服务"""
    
    def __init__(self, access_token: str, concurrency: Optional[int] = None):
        """
        初始化服务
        
        Args:
            access_token: 访问令牌
            concurrency: 并发数
        """
        self.access_token = access_token
        self.concurrency = concurrency or pool_config.concurrency
        self.executor = ConcurrentExecutor(self.concurrency)
        self.wrapper = PoolProviderWrapper()
    
    def list_members(
        self,
        team_id: str,
        *,
        request_id: Optional[str] = None,
    ) -> list[MemberInfo]:
        """
        列出团队成员
        
        Args:
            team_id: 团队ID（workspace_id）
            request_id: 请求ID
            
        Returns:
            成员信息列表
        """
        members_data = self.wrapper.list_team_members(
            self.access_token,
            team_id,
            request_id=request_id,
        )
        
        return [
            MemberInfo(
                member_id=m.get("id", ""),
                email=m.get("email", ""),
                name=m.get("name"),
                role=m.get("role"),
                status=m.get("status"),
            )
            for m in members_data
        ]
    
    async def kick_members_async(
        self,
        team_id: str,
        members: list[MemberInfo],
        *,
        request_id: Optional[str] = None,
    ) -> list[OperationResult]:
        """
        批量踢出成员（异步）
        
        Args:
            team_id: 团队ID
            members: 成员列表
            request_id: 请求ID
            
        Returns:
            操作结果列表
        """
        # 构造任务列表
        tasks = [
            (
                lambda m=m: self.wrapper.kick_member(
                    self.access_token,
                    team_id,
                    m.member_id,
                    m.email,
                    request_id=request_id,
                ),
                m.email,
            )
            for m in members
        ]
        
        # 并发执行
        results: list[TaskResult[RetryResult]] = await self.executor.execute_many(tasks)
        
        # 转换结果
        operation_results = []
        for i, task_result in enumerate(results):
            member = members[i]
            
            if task_result.is_success and task_result.data:
                retry_result: RetryResult = task_result.data
                operation_results.append(
                    OperationResult(
                        email=member.email,
                        success=retry_result.success,
                        error=str(retry_result.error) if retry_result.error else None,
                        attempts=retry_result.attempts,
                    )
                )
            else:
                operation_results.append(
                    OperationResult(
                        email=member.email,
                        success=False,
                        error=str(task_result.error) if task_result.error else "Unknown error",
                        attempts=task_result.attempt,
                    )
                )
        
        return operation_results
    
    def kick_members(
        self,
        team_id: str,
        members: list[MemberInfo],
        *,
        request_id: Optional[str] = None,
    ) -> list[OperationResult]:
        """
        批量踢出成员（同步接口）
        
        Args:
            team_id: 团队ID
            members: 成员列表
            request_id: 请求ID
            
        Returns:
            操作结果列表
        """
        return asyncio.run(self.kick_members_async(team_id, members, request_id=request_id))
    
    async def invite_members_async(
        self,
        team_id: str,
        emails: list[str],
        *,
        request_id: Optional[str] = None,
    ) -> list[OperationResult]:
        """
        批量邀请成员（异步）
        
        Args:
            team_id: 团队ID
            emails: 邮箱列表
            request_id: 请求ID
            
        Returns:
            操作结果列表
        """
        # 构造任务列表
        tasks = [
            (
                lambda e=e: self.wrapper.invite_member(
                    self.access_token,
                    team_id,
                    e,
                    request_id=request_id,
                ),
                e,
            )
            for e in emails
        ]
        
        # 并发执行
        results: list[TaskResult[RetryResult]] = await self.executor.execute_many(tasks)
        
        # 转换结果
        operation_results = []
        for i, task_result in enumerate(results):
            email = emails[i]
            
            if task_result.is_success and task_result.data:
                retry_result: RetryResult = task_result.data
                operation_results.append(
                    OperationResult(
                        email=email,
                        success=retry_result.success,
                        error=str(retry_result.error) if retry_result.error else None,
                        attempts=retry_result.attempts,
                    )
                )
            else:
                operation_results.append(
                    OperationResult(
                        email=email,
                        success=False,
                        error=str(task_result.error) if task_result.error else "Unknown error",
                        attempts=task_result.attempt,
                    )
                )
        
        return operation_results
    
    def invite_members(
        self,
        team_id: str,
        emails: list[str],
        *,
        request_id: Optional[str] = None,
    ) -> list[OperationResult]:
        """
        批量邀请成员（同步接口）
        
        Args:
            team_id: 团队ID
            emails: 邮箱列表
            request_id: 请求ID
            
        Returns:
            操作结果列表
        """
        return asyncio.run(self.invite_members_async(team_id, emails, request_id=request_id))

