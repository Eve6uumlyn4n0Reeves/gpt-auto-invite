"""
Pool API 专用数据模型

包含 API Key 管理等 Pool API 特有的模型。
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index
from .database import BasePool


class APIKey(BasePool):
    """Pool API 密钥模型"""
    __tablename__ = "pool_api_keys"

    id = Column(Integer, primary_key=True)
    key_hash = Column(String(128), nullable=False, unique=True, index=True)  # SHA-256哈希
    name = Column(String(100), nullable=True)  # 密钥名称/描述
    is_active = Column(Boolean, default=True, nullable=False, index=True)  # 是否启用
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)  # 最后使用时间
    metadata_json = Column(Text, nullable=True)  # 额外元数据（JSON）

    __table_args__ = (
        Index("ix_api_key_active", "is_active", "key_hash"),
    )

    def __repr__(self) -> str:
        return f"<APIKey(id={self.id}, name={self.name!r}, active={self.is_active})>"

