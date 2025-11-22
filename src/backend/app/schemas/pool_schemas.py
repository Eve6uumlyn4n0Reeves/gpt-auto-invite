"""
Pool API Pydantic 模型

定义请求和响应的数据模型。
"""
from typing import Optional
from pydantic import BaseModel, Field, EmailStr


# ============ 请求模型 ============

class KickMembersRequest(BaseModel):
    """批量踢人请求"""
    emails: list[EmailStr] = Field(..., description="要踢出的成员邮箱列表", min_length=1)
    concurrency: Optional[int] = Field(None, description="并发数（可选）", ge=1, le=20)
    retry_attempts: Optional[int] = Field(None, description="重试次数（可选）", ge=0, le=10)


class InviteMembersRequest(BaseModel):
    """批量邀请请求"""
    emails: list[EmailStr] = Field(..., description="要邀请的成员邮箱列表", min_length=1)
    concurrency: Optional[int] = Field(None, description="并发数（可选）", ge=1, le=20)
    retry_attempts: Optional[int] = Field(None, description="重试次数（可选）", ge=0, le=10)


class SwapTeamsRequest(BaseModel):
    """互换请求"""
    team_a: dict = Field(..., description="团队A信息")
    team_b: dict = Field(..., description="团队B信息")
    concurrency: Optional[int] = Field(None, description="并发数（可选）", ge=1, le=20)
    retry_attempts: Optional[int] = Field(None, description="重试次数（可选）", ge=0, le=10)
    
    class Config:
        json_schema_extra = {
            "example": {
                "team_a": {"workspace_id": "aab3722a-62f7-4184-bbac-fb125ec1f816"},
                "team_b": {"workspace_id": "db80c035-987e-4870-9922-cf3daad827e3"},
                "concurrency": 5,
                "retry_attempts": 3,
            }
        }


# ============ 响应模型 ============

class MemberInfoResponse(BaseModel):
    """成员信息响应"""
    member_id: str = Field(..., description="成员ID")
    email: str = Field(..., description="成员邮箱")
    name: Optional[str] = Field(None, description="成员名称")
    role: Optional[str] = Field(None, description="成员角色")
    status: Optional[str] = Field(None, description="成员状态")


class OperationResultItem(BaseModel):
    """单个操作结果"""
    email: str = Field(..., description="成员邮箱")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息（如果失败）")
    attempts: int = Field(..., description="尝试次数")


class ListMembersResponse(BaseModel):
    """列出成员响应"""
    ok: bool = Field(..., description="是否成功")
    members: list[MemberInfoResponse] = Field(..., description="成员列表")
    total: int = Field(..., description="成员总数")


class KickMembersResponse(BaseModel):
    """批量踢人响应"""
    ok: bool = Field(..., description="是否成功")
    done: list[str] = Field(..., description="成功踢出的邮箱列表")
    failed: list[OperationResultItem] = Field(..., description="失败的操作列表")
    stats: dict = Field(..., description="统计信息")
    
    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "done": ["user1@example.com", "user2@example.com"],
                "failed": [
                    {
                        "email": "user3@example.com",
                        "success": False,
                        "error": "Member not found",
                        "attempts": 3,
                    }
                ],
                "stats": {
                    "total": 3,
                    "succeeded": 2,
                    "failed": 1,
                    "duration_ms": 1234,
                },
            }
        }


class InviteMembersResponse(BaseModel):
    """批量邀请响应"""
    ok: bool = Field(..., description="是否成功")
    done: list[str] = Field(..., description="成功邀请的邮箱列表")
    failed: list[OperationResultItem] = Field(..., description="失败的操作列表")
    stats: dict = Field(..., description="统计信息")
    
    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "done": ["user1@example.com", "user2@example.com"],
                "failed": [],
                "stats": {
                    "total": 2,
                    "succeeded": 2,
                    "failed": 0,
                    "duration_ms": 987,
                },
            }
        }


class SwapStatsResponse(BaseModel):
    """互换统计响应"""
    team_a_kicked: int = Field(..., description="团队A踢出成功数")
    team_a_kick_failed: int = Field(..., description="团队A踢出失败数")
    team_b_kicked: int = Field(..., description="团队B踢出成功数")
    team_b_kick_failed: int = Field(..., description="团队B踢出失败数")
    team_a_invited: int = Field(..., description="团队A邀请成功数")
    team_a_invite_failed: int = Field(..., description="团队A邀请失败数")
    team_b_invited: int = Field(..., description="团队B邀请成功数")
    team_b_invite_failed: int = Field(..., description="团队B邀请失败数")
    total_kicked: int = Field(..., description="总踢出成功数")
    total_kick_failed: int = Field(..., description="总踢出失败数")
    total_invited: int = Field(..., description="总邀请成功数")
    total_invite_failed: int = Field(..., description="总邀请失败数")
    duration_ms: int = Field(..., description="总耗时（毫秒）")


class SwapTeamsResponse(BaseModel):
    """互换响应"""
    ok: bool = Field(..., description="是否成功")
    stats: SwapStatsResponse = Field(..., description="统计信息")
    team_a_kick_failed: list[OperationResultItem] = Field(..., description="团队A踢出失败列表")
    team_b_kick_failed: list[OperationResultItem] = Field(..., description="团队B踢出失败列表")
    team_a_invite_failed: list[OperationResultItem] = Field(..., description="团队A邀请失败列表")
    team_b_invite_failed: list[OperationResultItem] = Field(..., description="团队B邀请失败列表")
    error: Optional[str] = Field(None, description="错误信息（如果失败）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "stats": {
                    "team_a_kicked": 5,
                    "team_a_kick_failed": 0,
                    "team_b_kicked": 6,
                    "team_b_kick_failed": 0,
                    "team_a_invited": 6,
                    "team_a_invite_failed": 0,
                    "team_b_invited": 5,
                    "team_b_invite_failed": 0,
                    "total_kicked": 11,
                    "total_kick_failed": 0,
                    "total_invited": 11,
                    "total_invite_failed": 0,
                    "duration_ms": 5678,
                },
                "team_a_kick_failed": [],
                "team_b_kick_failed": [],
                "team_a_invite_failed": [],
                "team_b_invite_failed": [],
                "error": None,
            }
        }


# ============ 错误响应 ============

class ErrorResponse(BaseModel):
    """错误响应"""
    ok: bool = Field(False, description="是否成功")
    error: str = Field(..., description="错误代码")
    message: str = Field(..., description="错误消息")
    details: Optional[dict] = Field(None, description="详细信息")

