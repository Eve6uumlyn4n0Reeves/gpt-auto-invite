"""
WebSocket 实时通信端点
"""
import asyncio
import json
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session

from app import models
from app.routers.admin.dependencies import get_db
from app.security import verify_session_id

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """管理 WebSocket 连接"""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_personal(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message to websocket: {e}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast message: {e}")
                disconnected.append(connection)

        # 清理断开的连接
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


async def verify_admin_ws(token: str, db: Session = Depends(get_db)) -> bool:
    """验证 WebSocket 管理员会话"""
    try:
        session_id = verify_session_id(token)
        if not session_id:
            return False

        session = (
            db.query(models.AdminSession)
            .filter(
                models.AdminSession.session_id == session_id,
                models.AdminSession.revoked == False,  # noqa: E712
                models.AdminSession.expires_at > datetime.utcnow(),
            )
            .first()
        )
        return session is not None
    except Exception as e:
        logger.error(f"WebSocket auth failed: {e}")
        return False


@router.websocket("/ws/switch-queue")
async def switch_queue_websocket(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    切换队列实时状态推送

    连接参数:
    - token: 管理员 session_id

    推送消息格式:
    {
        "type": "queue_update" | "switch_completed" | "switch_failed",
        "data": {...}
    }
    """
    # 验证身份
    is_admin = await verify_admin_ws(token, db)
    if not is_admin:
        await websocket.close(code=4003, reason="Unauthorized")
        return

    await manager.connect(websocket)
    logger.info("New WebSocket connection established for switch queue")

    try:
        # 发送初始队列状态
        pending_requests = (
            db.query(models.SwitchRequest)
            .filter(models.SwitchRequest.status == models.SwitchRequestStatus.pending)
            .count()
        )
        
        await manager.send_personal(
            {
                "type": "queue_status",
                "data": {
                    "pending_count": pending_requests,
                    "connected_at": datetime.utcnow().isoformat(),
                },
            },
            websocket,
        )

        # 保持连接并定期发送心跳
        while True:
            try:
                # 等待客户端消息或超时
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # 处理客户端ping
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except asyncio.TimeoutError:
                # 发送心跳
                await websocket.send_json({"type": "heartbeat", "timestamp": datetime.utcnow().isoformat()})
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WebSocket connection closed")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


async def broadcast_queue_update(request_id: int, status: str, message: Optional[str] = None):
    """广播队列状态更新"""
    await manager.broadcast(
        {
            "type": "queue_update",
            "data": {
                "request_id": request_id,
                "status": status,
                "message": message,
                "timestamp": datetime.utcnow().isoformat(),
            },
        }
    )


async def broadcast_switch_event(event_type: str, email: str, result: dict):
    """广播切换事件"""
    await manager.broadcast(
        {
            "type": event_type,
            "data": {
                "email": email,
                "result": result,
                "timestamp": datetime.utcnow().isoformat(),
            },
        }
    )


__all__ = ["router", "broadcast_queue_update", "broadcast_switch_event"]

