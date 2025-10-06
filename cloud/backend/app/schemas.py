from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class MotherTeamIn(BaseModel):
    team_id: str
    team_name: Optional[str] = None
    is_enabled: bool = True
    is_default: bool = False

class MotherCreateIn(BaseModel):
    name: str
    access_token: str
    token_expires_at: Optional[datetime] = None
    teams: List[MotherTeamIn] = Field(default_factory=list)
    notes: Optional[str] = None

class MotherOut(BaseModel):
    id: int
    name: str
    status: str
    seat_limit: int
    seats_used: int
    token_expires_at: Optional[datetime]
    notes: Optional[str]
    teams: List[MotherTeamIn]
    
    class Config:
        from_attributes = True

class ImportCookieIn(BaseModel):
    cookie: str

class ImportCookieOut(BaseModel):
    access_token: str
    token_expires_at: Optional[datetime] = None
    user_email: Optional[str] = None
    account_id: Optional[str] = None

class RedeemIn(BaseModel):
    code: str
    email: str

class RedeemOut(BaseModel):
    success: bool
    message: str
    invite_request_id: Optional[int] = None
    mother_id: Optional[int] = None
    team_id: Optional[str] = None

class BatchCodesIn(BaseModel):
    count: int = Field(gt=0, le=10000)
    prefix: Optional[str] = None
    expires_at: Optional[datetime] = None
    batch_id: Optional[str] = None

class BatchCodesOut(BaseModel):
    batch_id: str
    codes: List[str]
    # Quota info (optional)
    enabled_teams: int | None = None
    max_code_capacity: int | None = None
    active_codes: int | None = None
    remaining_quota: int | None = None

class ResendIn(BaseModel):
    email: str
    team_id: Optional[str] = None
    code: Optional[str] = None

class AdminLoginIn(BaseModel):
    password: str

class AdminMeOut(BaseModel):
    authenticated: bool

class CancelInviteIn(BaseModel):
    email: str
    team_id: str

class RemoveMemberIn(BaseModel):
    email: str
    team_id: str

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
