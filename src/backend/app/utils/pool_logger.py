"""
Pool侧结构化日志系统

提供JSON格式的结构化日志，支持关键事件追踪和日志轮转。
"""
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from logging.handlers import TimedRotatingFileHandler

from ..config import pool_config


class PoolAction(str, Enum):
    """Pool操作类型"""
    # 互换操作
    SWAP = "swap"
    SWAP_STARTED = "swap_started"
    SWAP_COMPLETED = "swap_completed"
    SWAP_FAILED = "swap_failed"

    # 踢人操作
    KICK = "kick"
    KICK_STARTED = "kick_started"
    KICK_DONE = "kick_done"
    KICK_FAILED = "kick_failed"

    # 邀请操作
    INVITE = "invite"
    INVITE_STARTED = "invite_started"
    INVITE_DONE = "invite_done"
    INVITE_FAILED = "invite_failed"

    # 成员列表
    LIST_MEMBERS = "list_members"
    LIST_MEMBERS_STARTED = "list_members_started"
    LIST_MEMBERS_DONE = "list_members_done"
    LIST_MEMBERS_FAILED = "list_members_failed"

    # API请求
    API_REQUEST = "api_request"
    API_RESPONSE = "api_response"


class PoolStatus(str, Enum):
    """操作状态"""
    OK = "ok"
    FAILED = "failed"
    RETRYING = "retrying"


class StructuredPoolLogger:
    """Pool侧结构化日志记录器"""
    
    def __init__(self, name: str = "pool"):
        self.logger = logging.getLogger(f"pool.{name}")
        self._setup_logger()
    
    def _setup_logger(self) -> None:
        """配置日志记录器"""
        if self.logger.handlers:
            return  # 已配置
        
        self.logger.setLevel(logging.INFO)
        
        # 控制台处理器（JSON格式）
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(JSONFormatter())
        self.logger.addHandler(console_handler)
        
        # 文件处理器（带轮转，保留30天）
        log_dir = Path("logs/pool")
        log_dir.mkdir(parents=True, exist_ok=True)
        
        file_handler = TimedRotatingFileHandler(
            filename=log_dir / "pool.log",
            when="midnight",
            interval=1,
            backupCount=pool_config.log_retention_days,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(JSONFormatter())
        self.logger.addHandler(file_handler)
    
    def log_event(
        self,
        action: PoolAction,
        status: PoolStatus,
        *,
        team_id: Optional[str] = None,
        org_id: Optional[str] = None,
        email: Optional[str] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        attempt: Optional[int] = None,
        latency_ms: Optional[int] = None,
        request_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        provider_status: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> None:
        """记录结构化事件"""
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action.value,
            "status": status.value,
        }
        
        # 添加可选字段
        if team_id:
            event["team_id"] = team_id
        if org_id:
            event["org_id"] = org_id
        if email:
            event["email"] = email
        if error_code:
            event["error_code"] = error_code
        if error_message:
            event["error_message"] = error_message
        if attempt is not None:
            event["attempt"] = attempt
        if latency_ms is not None:
            event["latency_ms"] = latency_ms
        if request_id:
            event["request_id"] = request_id
        if api_key_id:
            event["api_key_id"] = api_key_id
        if provider_status is not None:
            event["provider_status"] = provider_status
        if extra:
            event["extra"] = extra
        
        # 根据状态选择日志级别
        if status == PoolStatus.FAILED:
            self.logger.error(json.dumps(event, ensure_ascii=False))
        elif status == PoolStatus.RETRYING:
            self.logger.warning(json.dumps(event, ensure_ascii=False))
        else:
            self.logger.info(json.dumps(event, ensure_ascii=False))
    
    def log_swap_started(
        self,
        team_a_id: str,
        team_b_id: str,
        request_id: str,
        **kwargs: Any,
    ) -> None:
        """记录互换开始"""
        self.log_event(
            PoolAction.SWAP_STARTED,
            PoolStatus.OK,
            request_id=request_id,
            extra={"team_a_id": team_a_id, "team_b_id": team_b_id, **kwargs},
        )
    
    def log_swap_completed(
        self,
        team_a_id: str,
        team_b_id: str,
        request_id: str,
        latency_ms: int,
        stats: dict[str, Any],
        **kwargs: Any,
    ) -> None:
        """记录互换完成"""
        self.log_event(
            PoolAction.SWAP_COMPLETED,
            PoolStatus.OK,
            request_id=request_id,
            latency_ms=latency_ms,
            extra={"team_a_id": team_a_id, "team_b_id": team_b_id, "stats": stats, **kwargs},
        )
    
    def log_swap_failed(
        self,
        team_a_id: str,
        team_b_id: str,
        request_id: str,
        error_code: str,
        error_message: str,
        **kwargs: Any,
    ) -> None:
        """记录互换失败"""
        self.log_event(
            PoolAction.SWAP_FAILED,
            PoolStatus.FAILED,
            request_id=request_id,
            error_code=error_code,
            error_message=error_message,
            extra={"team_a_id": team_a_id, "team_b_id": team_b_id, **kwargs},
        )
    
    def log_kick(
        self,
        team_id: str,
        email: str,
        status: PoolStatus,
        *,
        attempt: Optional[int] = None,
        latency_ms: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        provider_status: Optional[int] = None,
        **kwargs: Any,
    ) -> None:
        """记录踢人操作"""
        action = PoolAction.KICK_DONE if status == PoolStatus.OK else PoolAction.KICK_FAILED
        self.log_event(
            action,
            status,
            team_id=team_id,
            email=email,
            attempt=attempt,
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=error_message,
            provider_status=provider_status,
            extra=kwargs,
        )
    
    def log_invite(
        self,
        team_id: str,
        email: str,
        status: PoolStatus,
        *,
        attempt: Optional[int] = None,
        latency_ms: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        provider_status: Optional[int] = None,
        **kwargs: Any,
    ) -> None:
        """记录邀请操作"""
        action = PoolAction.INVITE_DONE if status == PoolStatus.OK else PoolAction.INVITE_FAILED
        self.log_event(
            action,
            status,
            team_id=team_id,
            email=email,
            attempt=attempt,
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=error_message,
            provider_status=provider_status,
            extra=kwargs,
        )


class JSONFormatter(logging.Formatter):
    """JSON格式化器"""
    
    def format(self, record: logging.LogRecord) -> str:
        """格式化日志记录为JSON"""
        # 如果消息已经是JSON，直接返回
        try:
            json.loads(record.getMessage())
            return record.getMessage()
        except (json.JSONDecodeError, ValueError):
            pass
        
        # 否则包装为标准格式
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, ensure_ascii=False)


# 全局日志实例
pool_logger = StructuredPoolLogger()


def generate_request_id() -> str:
    """生成请求ID"""
    return str(uuid.uuid4())

