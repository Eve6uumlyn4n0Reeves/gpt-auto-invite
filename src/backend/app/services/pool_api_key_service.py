"""
Pool API Key 管理服务

提供 API Key 的生成、验证、管理等功能。
"""
import hashlib
import secrets
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..models_pool_api import APIKey


class APIKeyService:
    """API Key 管理服务"""
    
    @staticmethod
    def generate_key() -> str:
        """
        生成新的 API Key（明文）
        
        格式：pool_<32字节随机hex>
        """
        random_bytes = secrets.token_bytes(32)
        return f"pool_{random_bytes.hex()}"
    
    @staticmethod
    def hash_key(key: str) -> str:
        """
        对 API Key 进行 SHA-256 哈希
        
        Args:
            key: 明文 API Key
            
        Returns:
            SHA-256 哈希值（hex格式）
        """
        return hashlib.sha256(key.encode("utf-8")).hexdigest()
    
    @staticmethod
    def verify_key(key: str, key_hash: str) -> bool:
        """
        验证 API Key（使用 timing-safe 比较）
        
        Args:
            key: 待验证的明文 API Key
            key_hash: 存储的哈希值
            
        Returns:
            是否匹配
        """
        computed_hash = APIKeyService.hash_key(key)
        return secrets.compare_digest(computed_hash, key_hash)
    
    @staticmethod
    def create_api_key(
        db: Session,
        name: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> tuple[APIKey, str]:
        """
        创建新的 API Key
        
        Args:
            db: 数据库会话
            name: API Key 名称/描述
            metadata: 额外元数据
            
        Returns:
            (APIKey对象, 明文key)
            
        注意：明文key只在创建时返回一次，不会再次提供
        """
        import json
        
        # 生成明文key
        plain_key = APIKeyService.generate_key()
        key_hash = APIKeyService.hash_key(plain_key)
        
        # 创建数据库记录
        api_key = APIKey(
            key_hash=key_hash,
            name=name,
            is_active=True,
            created_at=datetime.utcnow(),
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
        
        return api_key, plain_key
    
    @staticmethod
    def validate_api_key(db: Session, key: str) -> Optional[APIKey]:
        """
        验证 API Key 并返回对应的 APIKey 对象
        
        Args:
            db: 数据库会话
            key: 待验证的明文 API Key
            
        Returns:
            如果验证成功且key处于活跃状态，返回 APIKey 对象；否则返回 None
        """
        key_hash = APIKeyService.hash_key(key)
        
        # 查询活跃的 API Key
        stmt = select(APIKey).where(
            APIKey.key_hash == key_hash,
            APIKey.is_active == True,  # noqa: E712
        )
        api_key = db.execute(stmt).scalar_one_or_none()
        
        if api_key:
            # 更新最后使用时间
            api_key.last_used_at = datetime.utcnow()
            db.commit()
        
        return api_key
    
    @staticmethod
    def disable_api_key(db: Session, key_id: int) -> bool:
        """
        禁用 API Key
        
        Args:
            db: 数据库会话
            key_id: API Key ID
            
        Returns:
            是否成功禁用
        """
        stmt = select(APIKey).where(APIKey.id == key_id)
        api_key = db.execute(stmt).scalar_one_or_none()
        
        if not api_key:
            return False
        
        api_key.is_active = False
        db.commit()
        return True
    
    @staticmethod
    def enable_api_key(db: Session, key_id: int) -> bool:
        """
        启用 API Key
        
        Args:
            db: 数据库会话
            key_id: API Key ID
            
        Returns:
            是否成功启用
        """
        stmt = select(APIKey).where(APIKey.id == key_id)
        api_key = db.execute(stmt).scalar_one_or_none()
        
        if not api_key:
            return False
        
        api_key.is_active = True
        db.commit()
        return True
    
    @staticmethod
    def get_api_key_by_id(db: Session, key_id: int) -> Optional[APIKey]:
        """
        根据 ID 获取 API Key
        
        Args:
            db: 数据库会话
            key_id: API Key ID
            
        Returns:
            APIKey 对象或 None
        """
        stmt = select(APIKey).where(APIKey.id == key_id)
        return db.execute(stmt).scalar_one_or_none()
    
    @staticmethod
    def list_api_keys(
        db: Session,
        active_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[APIKey]:
        """
        列出 API Keys
        
        Args:
            db: 数据库会话
            active_only: 是否只返回活跃的key
            limit: 返回数量限制
            offset: 偏移量
            
        Returns:
            APIKey 对象列表
        """
        stmt = select(APIKey)
        
        if active_only:
            stmt = stmt.where(APIKey.is_active == True)  # noqa: E712
        
        stmt = stmt.order_by(APIKey.created_at.desc()).limit(limit).offset(offset)
        
        return list(db.execute(stmt).scalars().all())

