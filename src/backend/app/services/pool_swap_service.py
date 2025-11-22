"""
Pool 互换服务

实现两个团队之间的子号互换逻辑：先踢后拉。
"""
import time
from typing import Optional
from dataclasses import dataclass

from .pool_member_service import PoolMemberService, MemberInfo, OperationResult
from ..utils.pool_logger import pool_logger, PoolAction, PoolStatus, generate_request_id


@dataclass
class SwapStats:
    """互换统计"""
    team_a_kicked: int = 0
    team_a_kick_failed: int = 0
    team_b_kicked: int = 0
    team_b_kick_failed: int = 0
    team_a_invited: int = 0
    team_a_invite_failed: int = 0
    team_b_invited: int = 0
    team_b_invite_failed: int = 0
    duration_ms: int = 0
    
    @property
    def total_kicked(self) -> int:
        return self.team_a_kicked + self.team_b_kicked
    
    @property
    def total_kick_failed(self) -> int:
        return self.team_a_kick_failed + self.team_b_kick_failed
    
    @property
    def total_invited(self) -> int:
        return self.team_a_invited + self.team_b_invited
    
    @property
    def total_invite_failed(self) -> int:
        return self.team_a_invite_failed + self.team_b_invite_failed
    
    def to_dict(self) -> dict:
        return {
            "team_a_kicked": self.team_a_kicked,
            "team_a_kick_failed": self.team_a_kick_failed,
            "team_b_kicked": self.team_b_kicked,
            "team_b_kick_failed": self.team_b_kick_failed,
            "team_a_invited": self.team_a_invited,
            "team_a_invite_failed": self.team_a_invite_failed,
            "team_b_invited": self.team_b_invited,
            "team_b_invite_failed": self.team_b_invite_failed,
            "total_kicked": self.total_kicked,
            "total_kick_failed": self.total_kick_failed,
            "total_invited": self.total_invited,
            "total_invite_failed": self.total_invite_failed,
            "duration_ms": self.duration_ms,
        }


@dataclass
class SwapResult:
    """互换结果"""
    success: bool
    stats: SwapStats
    team_a_kick_results: list[OperationResult]
    team_b_kick_results: list[OperationResult]
    team_a_invite_results: list[OperationResult]
    team_b_invite_results: list[OperationResult]
    error: Optional[str] = None


class PoolSwapService:
    """Pool 互换服务"""
    
    def __init__(self, access_token: str, concurrency: Optional[int] = None):
        """
        初始化服务
        
        Args:
            access_token: 访问令牌
            concurrency: 并发数
        """
        self.access_token = access_token
        self.member_service = PoolMemberService(access_token, concurrency)
    
    def swap_teams(
        self,
        team_a_id: str,
        team_b_id: str,
        *,
        request_id: Optional[str] = None,
    ) -> SwapResult:
        """
        执行两个团队的子号互换
        
        流程：
        1. 列出 A 和 B 的成员
        2. 踢掉 A 的所有子号
        3. 踢掉 B 的所有子号
        4. A 邀请 B 的原子号
        5. B 邀请 A 的原子号
        
        Args:
            team_a_id: 团队A的workspace_id
            team_b_id: 团队B的workspace_id
            request_id: 请求ID（可选，自动生成）
            
        Returns:
            SwapResult
        """
        request_id = request_id or generate_request_id()
        start_time = time.time()
        
        # 记录互换开始
        pool_logger.log_swap_started(team_a_id, team_b_id, request_id)
        
        stats = SwapStats()
        
        try:
            # 1. 列出成员
            members_a = self.member_service.list_members(team_a_id, request_id=request_id)
            members_b = self.member_service.list_members(team_b_id, request_id=request_id)
            
            # 提取邮箱列表（用于后续邀请）
            emails_a = [m.email for m in members_a]
            emails_b = [m.email for m in members_b]
            
            # 2. 踢掉 A 的所有成员
            kick_a_results = self.member_service.kick_members(
                team_a_id,
                members_a,
                request_id=request_id,
            )
            stats.team_a_kicked = sum(1 for r in kick_a_results if r.success)
            stats.team_a_kick_failed = sum(1 for r in kick_a_results if not r.success)
            
            # 3. 踢掉 B 的所有成员
            kick_b_results = self.member_service.kick_members(
                team_b_id,
                members_b,
                request_id=request_id,
            )
            stats.team_b_kicked = sum(1 for r in kick_b_results if r.success)
            stats.team_b_kick_failed = sum(1 for r in kick_b_results if not r.success)
            
            # 4. A 邀请 B 的原子号
            invite_a_results = self.member_service.invite_members(
                team_a_id,
                emails_b,
                request_id=request_id,
            )
            stats.team_a_invited = sum(1 for r in invite_a_results if r.success)
            stats.team_a_invite_failed = sum(1 for r in invite_a_results if not r.success)
            
            # 5. B 邀请 A 的原子号
            invite_b_results = self.member_service.invite_members(
                team_b_id,
                emails_a,
                request_id=request_id,
            )
            stats.team_b_invited = sum(1 for r in invite_b_results if r.success)
            stats.team_b_invite_failed = sum(1 for r in invite_b_results if not r.success)
            
            # 计算总耗时
            stats.duration_ms = int((time.time() - start_time) * 1000)
            
            # 记录互换完成
            pool_logger.log_swap_completed(
                team_a_id,
                team_b_id,
                request_id,
                stats.duration_ms,
                stats.to_dict(),
            )
            
            return SwapResult(
                success=True,
                stats=stats,
                team_a_kick_results=kick_a_results,
                team_b_kick_results=kick_b_results,
                team_a_invite_results=invite_a_results,
                team_b_invite_results=invite_b_results,
            )
            
        except Exception as e:
            # 计算总耗时
            stats.duration_ms = int((time.time() - start_time) * 1000)
            
            # 记录互换失败
            pool_logger.log_swap_failed(
                team_a_id,
                team_b_id,
                request_id,
                type(e).__name__,
                str(e),
                stats=stats.to_dict(),
            )
            
            return SwapResult(
                success=False,
                stats=stats,
                team_a_kick_results=[],
                team_b_kick_results=[],
                team_a_invite_results=[],
                team_b_invite_results=[],
                error=str(e),
            )

