import re
from typing import List, Optional

from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict
from datetime import datetime

# 常用验证正则表达式
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
TEAM_ID_REGEX = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')
MOTHER_NAME_REGEX = re.compile(r'^[a-zA-Z0-9._%+-@]{1,100}$')
REDEEM_CODE_REGEX = re.compile(r'^[A-Za-z0-9]{8,32}$')

class MotherTeamIn(BaseModel):
    team_id: str = Field(..., min_length=1, max_length=50, description="团队ID")
    team_name: Optional[str] = Field(None, max_length=100, description="团队名称")
    is_enabled: bool = True
    is_default: bool = False

    @field_validator("team_id")
    @classmethod
    def validate_team_id(cls, v: str) -> str:
        if not TEAM_ID_REGEX.match(v):
            raise ValueError('团队ID只能包含字母、数字、下划线和连字符，长度1-50字符')
        return v

    @field_validator("team_name")
    @classmethod
    def validate_team_name(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v.strip()) == 0:
            raise ValueError('团队名称不能为空字符串')
        return v.strip() if v else v

class MotherCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="母号名称")
    access_token_enc: str = Field(..., min_length=10, max_length=1000, description="加密后的访问令牌")
    seat_limit: Optional[int] = Field(7, ge=1, le=100, description="席位限制")
    group_id: Optional[int] = Field(None, description="用户组ID")
    pool_group_id: Optional[int] = Field(None, description="号池组ID")
    notes: Optional[str] = Field(None, max_length=500, description="备注")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not MOTHER_NAME_REGEX.match(v):
            raise ValueError('母号名称只能包含字母、数字、点、下划线、百分号、加号、连字符和@符号，长度1-100字符')
        return v.strip()

    @field_validator("access_token_enc")
    @classmethod
    def validate_access_token_enc(cls, v: str) -> str:
        # 检查是否包含明显的恶意内容
        suspicious_patterns = ['<script', 'javascript:', 'vbscript:', 'onload=', 'onerror=']
        v_lower = v.lower()
        for pattern in suspicious_patterns:
            if pattern in v_lower:
                raise ValueError('访问令牌包含不安全的内容')
        return v


class MotherUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="母号名称")
    status: Optional[str] = Field(None, description="状态：active, invalid, disabled")
    seat_limit: Optional[int] = Field(None, ge=1, le=100, description="席位限制")
    group_id: Optional[int] = Field(None, description="用户组ID")
    pool_group_id: Optional[int] = Field(None, description="号池组ID")
    notes: Optional[str] = Field(None, max_length=500, description="备注")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not MOTHER_NAME_REGEX.match(v):
            raise ValueError('母号名称只能包含字母、数字、点、下划线、百分号、加号、连字符和@符号，长度1-100字符')
        return v.strip() if v else v

class MotherOut(BaseModel):
    id: int
    name: str
    status: str
    seat_limit: int
    group_id: Optional[int]
    pool_group_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    # 统计信息
    teams_count: int
    children_count: int
    seats_in_use: int
    seats_available: int

    # 详细信息（列表）
    teams: List[dict] = Field(default_factory=list)
    children: List[dict] = Field(default_factory=list)
    seats: List[dict] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class MotherListResult(BaseModel):
    items: List[MotherOut]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool

    model_config = ConfigDict(from_attributes=True)

class ImportCookieIn(BaseModel):
    cookie: str
    mode: Optional[str] = Field("user", description="导入模式：user 或 pool")
    pool_group_id: Optional[int] = Field(None, description="当 mode=pool 时必填的号池组ID")
    mother_group_id: Optional[int] = Field(None, description="当 mode=user 时可选的用户组ID")
    rename_after_import: bool = Field(False, description="user 模式：导入后立即重命名团队")

class ImportCookieOut(BaseModel):
    access_token: str
    token_expires_at: Optional[datetime] = None
    user_email: Optional[str] = None
    account_id: Optional[str] = None
    job_id: Optional[int] = None

class PoolGroupCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)

class PoolGroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PoolGroupSettingsIn(BaseModel):
    team_template: Optional[str] = Field(None, max_length=200)
    child_name_template: Optional[str] = Field(None, max_length=200)
    child_email_template: Optional[str] = Field(None, max_length=200)
    email_domain: Optional[str] = Field(None, max_length=255)
    is_active: bool = True

class NamePreviewOut(BaseModel):
    examples: List[str]

class RedeemIn(BaseModel):
    code: str = Field(..., min_length=8, max_length=32, description="兑换码")
    email: EmailStr = Field(..., description="邮箱地址")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        value = v.strip().upper()
        if not REDEEM_CODE_REGEX.match(value):
            raise ValueError('兑换码只能包含字母和数字，长度8-32字符')
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: EmailStr) -> EmailStr:
        value = v.lower().strip()
        if len(value) > 254:  # RFC 5321 标准
            raise ValueError('邮箱地址过长')
        return value

class RedeemOut(BaseModel):
    success: bool
    message: str
    invite_request_id: Optional[int] = None
    mother_id: Optional[int] = None
    team_id: Optional[str] = None

class BatchCodesIn(BaseModel):
    count: int = Field(gt=0, le=1000, description="生成数量")
    prefix: Optional[str] = Field(None, max_length=10, description="前缀")
    expires_at: Optional[datetime] = None
    batch_id: Optional[str] = Field(None, max_length=50, description="批次ID")
    mother_group_id: Optional[int] = Field(None, description="限定用户组ID（兑换时仅在该组内分配）")

    @field_validator("prefix")
    @classmethod
    def validate_prefix(cls, v: Optional[str]) -> Optional[str]:
        if v:
            value = v.strip().upper()
            if not re.match(r'^[A-Z0-9]*$', value):
                raise ValueError('前缀只能包含大写字母和数字')
            return value
        return v

    @field_validator("batch_id")
    @classmethod
    def validate_batch_id(cls, v: Optional[str]) -> Optional[str]:
        if v:
            value = v.strip()
            if not re.match(r'^[a-zA-Z0-9_-]+$', value):
                raise ValueError('批次ID只能包含字母、数字、下划线和连字符')
            return value
        return v

class BatchCodesOut(BaseModel):
    batch_id: str
    codes: List[str]
    # Quota info (optional)
    enabled_teams: Optional[int] = None
    max_code_capacity: Optional[int] = None
    active_codes: Optional[int] = None
    remaining_quota: Optional[int] = None

class ResendIn(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")
    team_id: Optional[str] = Field(None, max_length=50, description="团队ID")
    code: Optional[str] = Field(None, max_length=32, description="兑换码")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: EmailStr) -> EmailStr:
        return v.lower().strip()

    @field_validator("team_id")
    @classmethod
    def validate_team_id(cls, v: Optional[str]) -> Optional[str]:
        if v and not TEAM_ID_REGEX.match(v):
            raise ValueError('团队ID格式不正确')
        return v.strip() if v else v

class AdminLoginIn(BaseModel):
    password: str = Field(..., min_length=1, max_length=128, description="密码")

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        # 检查明显的SQL注入模式
        sql_patterns = ["'", '"', ';', '--', '/*', '*/', 'xp_', 'sp_', 'DROP', 'INSERT', 'UPDATE', 'DELETE']
        v_upper = v.upper()
        for pattern in sql_patterns:
            if pattern in v_upper:
                raise ValueError('密码包含不安全的内容')
        return v

class AdminMeOut(BaseModel):
    authenticated: bool

class CancelInviteIn(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")
    team_id: str = Field(..., min_length=1, max_length=50, description="团队ID")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: EmailStr) -> EmailStr:
        return v.lower().strip()

    @field_validator("team_id")
    @classmethod
    def validate_team_id(cls, v: str) -> str:
        value = v.strip()
        if not TEAM_ID_REGEX.match(value):
            raise ValueError('团队ID格式不正确')
        return value

class RemoveMemberIn(BaseModel):
    email: EmailStr = Field(..., description="邮箱地址")
    team_id: str = Field(..., min_length=1, max_length=50, description="团队ID")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: EmailStr) -> EmailStr:
        return v.lower().strip()

    @field_validator("team_id")
    @classmethod
    def validate_team_id(cls, v: str) -> str:
        value = v.strip()
        if not TEAM_ID_REGEX.match(value):
            raise ValueError('团队ID格式不正确')
        return value

class ImportAccessTokenIn(BaseModel):
    access_token: str
    token_expires_at: Optional[datetime] = None
    user_email: Optional[str] = None
    account_id: Optional[str] = None

class AdminChangePasswordIn(BaseModel):
    old_password: str
    new_password: str

class MotherTeamsUpdateIn(BaseModel):
    teams: List[MotherTeamIn] = Field(default_factory=list)

# 批量导入母号
class MotherBatchItemIn(BaseModel):
    name: str
    access_token: str
    token_expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    teams: List[MotherTeamIn] = Field(default_factory=list)

class MotherBatchValidateItemOut(BaseModel):
    index: int
    name: str
    valid: bool
    warnings: List[str] = Field(default_factory=list)
    teams: List[MotherTeamIn] = Field(default_factory=list)

class MotherBatchImportItemResult(BaseModel):
    index: int
    success: bool
    mother_id: Optional[int] = None
    error: Optional[str] = None

class BatchOpIn(BaseModel):
    action: str
    ids: List[int]
    confirm: bool = False

class BatchOpOut(BaseModel):
    success: bool
    message: str
    processed_count: Optional[int] = None
    failed_count: Optional[int] = None

class BatchOperationSupportedActions(BaseModel):
    codes: List[str] = Field(default_factory=lambda: ["disable"])
    users: List[str] = Field(default_factory=lambda: ["resend", "cancel", "remove"])

# 用户组相关
class MotherGroupCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="用户组名称")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    team_name_template: Optional[str] = Field(None, max_length=200, description="Team名称模板")

class MotherGroupUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="用户组名称")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    team_name_template: Optional[str] = Field(None, max_length=200, description="Team名称模板")
    is_active: Optional[bool] = Field(None, description="是否活跃")

class MotherGroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    team_name_template: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# API响应统一格式
class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None
    error: Optional[str] = None
