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
from app.database import Base

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

class MotherAccount(Base):
    __tablename__ = "mother_accounts"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    access_token_enc = Column(Text, nullable=False)
    token_expires_at = Column(DateTime, nullable=True)
    status = Column(Enum(MotherStatus), default=MotherStatus.active, nullable=False)
    seat_limit = Column(Integer, default=7, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    teams = relationship("MotherTeam", back_populates="mother", cascade="all, delete-orphan")

class MotherTeam(Base):
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

class SeatAllocation(Base):
    __tablename__ = "seats"
    
    id = Column(Integer, primary_key=True)
    mother_id = Column(Integer, ForeignKey("mother_accounts.id", ondelete="CASCADE"), nullable=False)
    slot_index = Column(Integer, nullable=False)  # 1..7
    team_id = Column(String(64), nullable=True)
    email = Column(String(320), nullable=True)
    status = Column(Enum(SeatStatus), default=SeatStatus.free, nullable=False)
    held_until = Column(DateTime, nullable=True)
    invite_request_id = Column(Integer, ForeignKey("invite_requests.id", ondelete="SET NULL"), nullable=True)
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

class InviteRequest(Base):
    __tablename__ = "invite_requests"
    
    id = Column(Integer, primary_key=True)
    mother_id = Column(Integer, ForeignKey("mother_accounts.id", ondelete="SET NULL"), nullable=True)
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

class RedeemCode(Base):
    __tablename__ = "redeem_codes"
    
    id = Column(Integer, primary_key=True)
    code_hash = Column(String(128), unique=True, nullable=False)
    batch_id = Column(String(64), nullable=True)
    status = Column(Enum(CodeStatus), default=CodeStatus.unused, nullable=False)
    used_by_email = Column(String(320), nullable=True)
    used_by_mother_id = Column(Integer, ForeignKey("mother_accounts.id", ondelete="SET NULL"), nullable=True)
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

class AdminConfig(Base):
    __tablename__ = "admin_config"
    
    id = Column(Integer, primary_key=True)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class AdminSession(Base):
    __tablename__ = "admin_sessions"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    ip = Column(String(45), nullable=True)
    ua = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class AuditLog(Base):
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
