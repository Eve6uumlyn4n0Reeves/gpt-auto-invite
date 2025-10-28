from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Enum,
    Boolean,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.database import BaseUsers, BasePool

class MotherStatus(str, enum.Enum):
    active = "active"
    invalid = "invalid"  # token invalid/expired
    disabled = "disabled"  # manually disabled

class SeatStatus(str, enum.Enum):
    free = "free"
    held = "held"
    used = "used"

class InviteStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    accepted = "accepted"
    failed = "failed"
    cancelled = "cancelled"

class CodeStatus(str, enum.Enum):
    unused = "unused"
    used = "used"
    expired = "expired"
    blocked = "blocked"

class MotherGroup(BasePool):
    __tablename__ = "mother_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    team_name_template = Column(String(200), nullable=True)  # Team名称模板
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # 关系
    mothers = relationship("MotherAccount", back_populates="group")


class PoolGroup(BasePool):
    __tablename__ = "pool_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PoolGroupSettings(BasePool):
    __tablename__ = "pool_group_settings"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("pool_groups.id", ondelete="CASCADE"), nullable=False, unique=True)
    team_template = Column(String(200), nullable=True)  # e.g. {group}-{date}-{seq3}
    child_name_template = Column(String(200), nullable=True)  # e.g. {group}-{date}-{seq3}
    child_email_template = Column(String(200), nullable=True)  # e.g. {group}-{date}-{seq3}@{domain}
    email_domain = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class GroupDailySequence(BasePool):
    __tablename__ = "group_daily_sequences"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("pool_groups.id", ondelete="CASCADE"), nullable=False)
    seq_type = Column(String(16), nullable=False)  # 'team' | 'child'
    date_yyyymmdd = Column(String(8), nullable=False)
    current_value = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("group_id", "seq_type", "date_yyyymmdd", name="uq_group_seq_date"),
        Index("ix_group_seq", "group_id", "seq_type", "date_yyyymmdd"),
    )

class ChildAccount(BasePool):
    __tablename__ = "child_accounts"

    id = Column(Integer, primary_key=True)
    child_id = Column(String(100), nullable=False, unique=True)  # 子号ID
    name = Column(String(200), nullable=False)  # 子号名称
    email = Column(String(255), nullable=False)  # 子号邮箱
    mother_id = Column(Integer, ForeignKey("mother_accounts.id"), nullable=False)
    team_id = Column(String(100), nullable=False)  # 承接的team_id
    team_name = Column(String(200), nullable=False)  # Team名称
    status = Column(String(50), default="active", nullable=False)  # active/inactive/suspended
    access_token_enc = Column(Text, nullable=True)  # 子号的access token
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    member_id = Column(String(128), nullable=True)

    # 关系
    mother = relationship("MotherAccount", back_populates="children")

    __table_args__ = (
        UniqueConstraint("mother_id", "team_id", "email", name="uq_child_one_team"),
        Index("ix_child_mother", "mother_id"),
    )

class MotherAccount(BasePool):
    __tablename__ = "mother_accounts"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    access_token_enc = Column(Text, nullable=False)
    token_expires_at = Column(DateTime, nullable=True)
    status = Column(Enum(MotherStatus), default=MotherStatus.active, nullable=False)
    seat_limit = Column(Integer, default=7, nullable=False)
    notes = Column(Text, nullable=True)
    group_id = Column(Integer, ForeignKey("mother_groups.id"), nullable=True)
    pool_group_id = Column(Integer, ForeignKey("pool_groups.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # 关系
    group = relationship("MotherGroup", back_populates="mothers")
    teams = relationship("MotherTeam", back_populates="mother", cascade="all, delete-orphan")
    children = relationship("ChildAccount", back_populates="mother", cascade="all, delete-orphan")

class MotherTeam(BasePool):
    __tablename__ = "mother_teams"
    
    id = Column(Integer, primary_key=True)
    mother_id = Column(Integer, ForeignKey("mother_accounts.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(String(64), nullable=False)
    team_name = Column(String(255), nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    mother = relationship("MotherAccount", back_populates="teams")
    
    __table_args__ = (
        UniqueConstraint("mother_id", "team_id", name="uq_mother_team"),
        Index("ix_team_enabled", "team_id", "is_enabled"),
    )

class SeatAllocation(BasePool):
    __tablename__ = "seats"
    
    id = Column(Integer, primary_key=True)
    mother_id = Column(Integer, ForeignKey("mother_accounts.id", ondelete="CASCADE"), nullable=False)
    slot_index = Column(Integer, nullable=False)  # 1..7
    team_id = Column(String(64), nullable=True)
    email = Column(String(320), nullable=True)
    status = Column(Enum(SeatStatus), default=SeatStatus.free, nullable=False)
    held_until = Column(DateTime, nullable=True)
    # 跨库字段：在物理分库下不建立 DB 级外键，仅保留引用 ID
    invite_request_id = Column(Integer, nullable=True)
    invite_id = Column(String(128), nullable=True)
    member_id = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        UniqueConstraint("mother_id", "slot_index", name="uq_mother_slot"),
        UniqueConstraint("team_id", "email", name="uq_team_email_single_seat"),
        Index("ix_seat_mother", "mother_id"),
        Index("ix_seat_status", "status"),
    )

class InviteRequest(BaseUsers):
    __tablename__ = "invite_requests"
    
    id = Column(Integer, primary_key=True)
    # 跨库字段（Pool→Users）：不建立外键
    mother_id = Column(Integer, nullable=True)
    team_id = Column(String(64), nullable=False)
    email = Column(String(320), nullable=False)
    code_id = Column(Integer, ForeignKey("redeem_codes.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(InviteStatus), default=InviteStatus.pending, nullable=False)
    error_code = Column(String(64), nullable=True)
    error_msg = Column(Text, nullable=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    last_attempt_at = Column(DateTime, nullable=True)
    invite_id = Column(String(128), nullable=True)
    member_id = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        Index("ix_invite_email_team", "email", "team_id"),
        Index("ix_invite_status", "status"),
    )

class RedeemCode(BaseUsers):
    __tablename__ = "redeem_codes"
    
    id = Column(Integer, primary_key=True)
    code_hash = Column(String(128), unique=True, nullable=False)
    batch_id = Column(String(64), nullable=True)
    status = Column(Enum(CodeStatus), default=CodeStatus.unused, nullable=False)
    used_by_email = Column(String(320), nullable=True)
    # 跨库字段：不建立外键
    used_by_mother_id = Column(Integer, nullable=True)
    used_by_team_id = Column(String(64), nullable=True)
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    meta_json = Column(Text, nullable=True)
    
    __table_args__ = (
        Index("ix_redeem_status_exp", "status", "expires_at"),
    )
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Compatibility properties for migrated routers that expect these fields
    @property
    def is_used(self) -> bool:  # type: ignore[override]
        return self.status == CodeStatus.used

    @property
    def code(self) -> str:
        # Plain code is not stored; expose hash for compatibility
        return self.code_hash

    @property
    def updated_at(self):
        # Align with places that previously used updated_at to indicate usage time
        return self.used_at

class AdminConfig(BaseUsers):
    __tablename__ = "admin_config"
    
    id = Column(Integer, primary_key=True)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class AdminSession(BaseUsers):
    __tablename__ = "admin_sessions"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    ip = Column(String(45), nullable=True)
    ua = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class AuditLog(BaseUsers):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True)
    actor = Column(String(64), nullable=False)
    action = Column(String(64), nullable=False)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(128), nullable=True)
    payload_redacted = Column(Text, nullable=True)
    ip = Column(String(45), nullable=True)
    ua = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class BulkOperationType(str, enum.Enum):
    mother_import = "mother_import"
    mother_import_text = "mother_import_text"
    code_generate = "code_generate"
    code_bulk_action = "code_bulk_action"

class BulkOperationLog(BaseUsers):
    __tablename__ = "bulk_operation_logs"

    id = Column(Integer, primary_key=True)
    operation_type = Column(Enum(BulkOperationType), nullable=False)
    actor = Column(String(64), nullable=False, default="admin")
    total_count = Column(Integer, nullable=True)
    success_count = Column(Integer, nullable=True)
    failed_count = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_bulk_operation_created_at", "created_at"),
    )

class BatchJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"

class BatchJobType(str, enum.Enum):
    users_resend = "users_resend"
    users_cancel = "users_cancel"
    users_remove = "users_remove"
    codes_disable = "codes_disable"
    pool_sync_mother = "pool_sync_mother"

class BatchJob(BaseUsers):
    __tablename__ = "batch_jobs"

    id = Column(Integer, primary_key=True)
    job_type = Column(Enum(BatchJobType), nullable=False)
    status = Column(Enum(BatchJobStatus), default=BatchJobStatus.pending, nullable=False)
    actor = Column(String(64), nullable=True)
    payload_json = Column(Text, nullable=True)
    total_count = Column(Integer, nullable=True)
    success_count = Column(Integer, nullable=True)
    failed_count = Column(Integer, nullable=True)
    last_error = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    visible_until = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_batch_job_status", "status"),
        Index("ix_batch_job_created_at", "created_at"),
    )
