"""
Pool API 路由

提供 Pool 侧的对外 API 接口。
"""
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..database import SessionPool
from ..models import MotherTeam

# Import pool schemas from the schemas directory
import sys
from pathlib import Path
schemas_dir = Path(__file__).parent.parent / "schemas"
sys.path.insert(0, str(schemas_dir))
from pool_schemas import (
    KickMembersRequest,
    InviteMembersRequest,
    SwapTeamsRequest,
    ListMembersResponse,
    KickMembersResponse,
    InviteMembersResponse,
    SwapTeamsResponse,
    MemberInfoResponse,
    OperationResultItem,
    SwapStatsResponse,
    ErrorResponse,
)
sys.path.pop(0)
from ..services.pool_member_service import PoolMemberService
from ..services.pool_swap_service import PoolSwapService
from ..middleware.pool_api_auth import get_request_id
from ..utils.pool_logger import pool_logger, PoolAction, PoolStatus


router = APIRouter(prefix="/pool", tags=["Pool API"])


def get_pool_db() -> Session:
    """获取 Pool 数据库会话"""
    db = SessionPool()
    try:
        yield db
    finally:
        db.close()


def get_mother_team(db: Session, workspace_id: str) -> MotherTeam:
    """
    获取母号团队记录
    
    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        
    Returns:
        MotherTeam
        
    Raises:
        HTTPException: 404 如果未找到
    """
    team = db.query(MotherTeam).filter(
        MotherTeam.workspace_id == workspace_id,
        MotherTeam.is_enabled == True,
    ).first()
    
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team with workspace_id={workspace_id} not found or disabled",
        )
    
    return team


@router.get(
    "/teams/{workspace_id}/members",
    response_model=ListMembersResponse,
    summary="列出团队成员",
    description="获取指定团队的所有成员列表",
)
def list_team_members(
    workspace_id: str,
    request: Request,
    db: Session = Depends(get_pool_db),
):
    """列出团队成员"""
    request_id = get_request_id(request)
    
    try:
        # 获取母号团队记录
        team = get_mother_team(db, workspace_id)
        
        # 获取母号的 access_token
        access_token = team.mother.access_token
        
        # 创建服务并列出成员
        service = PoolMemberService(access_token)
        members = service.list_members(workspace_id, request_id=request_id)
        
        return ListMembersResponse(
            ok=True,
            members=[
                MemberInfoResponse(
                    member_id=m.member_id,
                    email=m.email,
                    name=m.name,
                    role=m.role,
                    status=m.status,
                )
                for m in members
            ],
            total=len(members),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        pool_logger.log_event(
            PoolAction.LIST_MEMBERS,
            PoolStatus.FAILED,
            team_id=workspace_id,
            request_id=request_id,
            error_code=type(e).__name__,
            error_message=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list members: {str(e)}",
        )


@router.post(
    "/teams/{workspace_id}/members:kick",
    response_model=KickMembersResponse,
    summary="批量踢出成员",
    description="从指定团队批量踢出成员",
)
def kick_team_members(
    workspace_id: str,
    body: KickMembersRequest,
    request: Request,
    db: Session = Depends(get_pool_db),
):
    """批量踢出成员"""
    request_id = get_request_id(request)
    start_time = time.time()
    
    try:
        # 获取母号团队记录
        team = get_mother_team(db, workspace_id)
        access_token = team.mother.access_token
        
        # 创建服务
        service = PoolMemberService(access_token, concurrency=body.concurrency)
        
        # 先列出成员，找到要踢的成员
        all_members = service.list_members(workspace_id, request_id=request_id)
        
        # 过滤出要踢的成员
        emails_to_kick = set(body.emails)
        members_to_kick = [m for m in all_members if m.email in emails_to_kick]
        
        # 执行踢人
        results = service.kick_members(workspace_id, members_to_kick, request_id=request_id)
        
        # 统计结果
        succeeded = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        duration_ms = int((time.time() - start_time) * 1000)
        
        return KickMembersResponse(
            ok=True,
            done=[r.email for r in succeeded],
            failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in failed
            ],
            stats={
                "total": len(results),
                "succeeded": len(succeeded),
                "failed": len(failed),
                "duration_ms": duration_ms,
            },
        )
        
    except HTTPException:
        raise
    except Exception as e:
        pool_logger.log_event(
            PoolAction.KICK,
            PoolStatus.FAILED,
            team_id=workspace_id,
            request_id=request_id,
            error_code=type(e).__name__,
            error_message=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to kick members: {str(e)}",
        )


@router.post(
    "/teams/{workspace_id}/members:invite",
    response_model=InviteMembersResponse,
    summary="批量邀请成员",
    description="向指定团队批量邀请成员",
)
def invite_team_members(
    workspace_id: str,
    body: InviteMembersRequest,
    request: Request,
    db: Session = Depends(get_pool_db),
):
    """批量邀请成员"""
    request_id = get_request_id(request)
    start_time = time.time()
    
    try:
        # 获取母号团队记录
        team = get_mother_team(db, workspace_id)
        access_token = team.mother.access_token
        
        # 创建服务
        service = PoolMemberService(access_token, concurrency=body.concurrency)
        
        # 执行邀请
        results = service.invite_members(workspace_id, body.emails, request_id=request_id)
        
        # 统计结果
        succeeded = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        duration_ms = int((time.time() - start_time) * 1000)
        
        return InviteMembersResponse(
            ok=True,
            done=[r.email for r in succeeded],
            failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in failed
            ],
            stats={
                "total": len(results),
                "succeeded": len(succeeded),
                "failed": len(failed),
                "duration_ms": duration_ms,
            },
        )
        
    except HTTPException:
        raise
    except Exception as e:
        pool_logger.log_event(
            PoolAction.INVITE,
            PoolStatus.FAILED,
            team_id=workspace_id,
            request_id=request_id,
            error_code=type(e).__name__,
            error_message=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to invite members: {str(e)}",
        )


@router.post(
    "/teams:swap",
    response_model=SwapTeamsResponse,
    summary="互换两个团队的子号",
    description="执行两个团队之间的子号互换：先踢后拉",
)
def swap_teams(
    body: SwapTeamsRequest,
    request: Request,
    db: Session = Depends(get_pool_db),
):
    """互换两个团队的子号"""
    request_id = get_request_id(request)
    
    try:
        # 提取 workspace_id
        workspace_id_a = body.team_a.get("workspace_id")
        workspace_id_b = body.team_b.get("workspace_id")
        
        if not workspace_id_a or not workspace_id_b:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Both team_a.workspace_id and team_b.workspace_id are required",
            )
        
        # 获取两个团队的母号记录
        team_a = get_mother_team(db, workspace_id_a)
        team_b = get_mother_team(db, workspace_id_b)
        
        # 使用团队A的 access_token（假设两个团队属于同一母号或有权限）
        # 如果需要分别使用不同的 token，需要修改 SwapService
        access_token = team_a.mother.access_token
        
        # 创建服务
        service = PoolSwapService(access_token, concurrency=body.concurrency)
        
        # 执行互换
        swap_result = service.swap_teams(workspace_id_a, workspace_id_b, request_id=request_id)
        
        # 构造响应
        return SwapTeamsResponse(
            ok=swap_result.success,
            stats=SwapStatsResponse(**swap_result.stats.to_dict()),
            team_a_kick_failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in swap_result.team_a_kick_results if not r.success
            ],
            team_b_kick_failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in swap_result.team_b_kick_results if not r.success
            ],
            team_a_invite_failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in swap_result.team_a_invite_results if not r.success
            ],
            team_b_invite_failed=[
                OperationResultItem(
                    email=r.email,
                    success=r.success,
                    error=r.error,
                    attempts=r.attempts,
                )
                for r in swap_result.team_b_invite_results if not r.success
            ],
            error=swap_result.error,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        pool_logger.log_event(
            PoolAction.SWAP,
            PoolStatus.FAILED,
            request_id=request_id,
            error_code=type(e).__name__,
            error_message=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to swap teams: {str(e)}",
        )

