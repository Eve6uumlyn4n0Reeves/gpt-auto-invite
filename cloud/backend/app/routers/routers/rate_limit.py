"""
限流统计和监控接口
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services.services.rate_limiter_service import get_rate_limiter
from app.utils.utils.rate_limiter import RateLimiter
from app.routers.routers.admin import require_admin
from starlette.requests import Request

router = APIRouter(prefix="/api/admin/rate-limit", tags=["rate-limit"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_limiter() -> RateLimiter:
    """获取限流器实例"""
    return await get_rate_limiter()


@router.get("/status/{key}")
async def get_rate_limit_status(
    key: str,
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """获取指定键的限流状态"""
    require_admin(request, db)

    try:
        status = await limiter.get_status(key)
        return {
            "key": status.key,
            "remaining": status.remaining,
            "reset_at_ms": status.reset_at_ms,
            "reset_at_seconds": status.reset_at_ms // 1000,
            "limit": status.limit,
            "used": status.limit - status.remaining,
            "usage_percentage": round((status.limit - status.remaining) / status.limit * 100, 2) if status.limit > 0 else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取限流状态失败: {str(e)}")


@router.get("/stats/{key}")
async def get_rate_limit_stats(
    key: str,
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """获取指定键的限流统计信息"""
    require_admin(request, db)

    try:
        stats = await limiter.get_stats(key)
        return {
            "key": stats.key,
            "allowed": stats.allowed,
            "denied": stats.denied,
            "total": stats.allowed + stats.denied,
            "success_rate": round(stats.allowed / (stats.allowed + stats.denied) * 100, 2) if (stats.allowed + stats.denied) > 0 else 0,
            "last_allowed_ms": stats.last_allowed_ms,
            "last_allowed_seconds": stats.last_allowed_ms // 1000 if stats.last_allowed_ms else None,
            "last_denied_ms": stats.last_denied_ms,
            "last_denied_seconds": stats.last_denied_ms // 1000 if stats.last_denied_ms else None,
            "remaining": stats.remaining,
            "capacity": stats.capacity,
            "current_usage": round((stats.capacity - stats.remaining) / stats.capacity * 100, 2) if stats.capacity > 0 else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取限流统计失败: {str(e)}")


@router.get("/top-denied")
async def get_top_denied_keys(
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter),
    limit: int = Query(10, ge=1, le=100, description="返回数量限制")
):
    """获取被拒绝次数最多的键"""
    require_admin(request, db)

    try:
        # 如果是Redis限流器，获取排行榜
        if hasattr(limiter, 'get_top_denied'):
            top_denied = await limiter.get_top_denied(limit)
            return {
                "top_denied": [
                    {
                        "key": key,
                        "denied_count": count,
                        "stats_url": f"/api/admin/rate-limit/stats/{key}"
                    }
                    for key, count in top_denied
                ]
            }
        else:
            return {"message": "当前使用内存限流器，不提供排行榜功能"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取被拒绝排行榜失败: {str(e)}")


@router.get("/config")
async def list_rate_limit_configs(
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """列出所有限流配置"""
    require_admin(request, db)

    try:
        # 如果是Redis限流器，列出配置
        if hasattr(limiter, 'get_config'):
            config_ids = [
                "redeem:by_ip",
                "resend:by_ip",
                "resend:by_email",
                "admin:by_ip"
            ]

            configs = {}
            for config_id in config_ids:
                config = await limiter.get_config(config_id)
                if config:
                    configs[config_id] = {
                        "capacity": config.capacity,
                        "refill_rate": config.refill_rate,
                        "refill_rate_per_minute": round(config.refill_rate * 60, 2),
                        "expire_seconds": config.expire_seconds,
                        "name": config.name,
                        "requests_per_period": f"{config.capacity} per {round(config.capacity / config.refill_rate)}s" if config.refill_rate > 0 else f"{config.capacity} total"
                    }

            return {
                "configs": configs,
                "limiter_type": "redis" if hasattr(limiter, 'get_top_denied') else "memory"
            }
        else:
            return {
                "configs": {},
                "limiter_type": "memory",
                "message": "当前使用内存限流器"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取限流配置失败: {str(e)}")


@router.post("/config/{config_id}")
async def update_rate_limit_config(
    config_id: str,
    config_data: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """更新限流配置"""
    require_admin(request, db)

    try:
        # 只有Redis限流器支持动态配置
        if not hasattr(limiter, 'set_config'):
            raise HTTPException(status_code=400, detail="内存限流器不支持动态配置")

        from app.utils.utils.rate_limiter import RateLimitConfig

        # 验证并创建配置
        capacity = config_data.get("capacity")
        refill_rate = config_data.get("refill_rate")
        expire_seconds = config_data.get("expire_seconds", 0)
        name = config_data.get("name", config_id)

        if not capacity or not refill_rate:
            raise HTTPException(status_code=400, detail="capacity和refill_rate为必需参数")

        config = RateLimitConfig(
            capacity=int(capacity),
            refill_rate=float(refill_rate),
            expire_seconds=int(expire_seconds),
            name=str(name)
        )

        await limiter.set_config(config_id, config)

        return {
            "success": True,
            "message": f"限流配置 {config_id} 已更新",
            "config": {
                "capacity": config.capacity,
                "refill_rate": config.refill_rate,
                "refill_rate_per_minute": round(config.refill_rate * 60, 2),
                "expire_seconds": config.expire_seconds,
                "name": config.name
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"配置参数错误: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新限流配置失败: {str(e)}")


@router.delete("/config/{config_id}")
async def delete_rate_limit_config(
    config_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """删除限流配置"""
    require_admin(request, db)

    try:
        # 只有Redis限流器支持动态配置
        if not hasattr(limiter, 'delete_config'):
            raise HTTPException(status_code=400, detail="内存限流器不支持动态配置")

        await limiter.delete_config(config_id)

        return {
            "success": True,
            "message": f"限流配置 {config_id} 已删除"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除限流配置失败: {str(e)}")


@router.get("/health")
async def rate_limit_health(
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """限流器健康检查"""
    require_admin(request, db)

    try:
        # 测试限流器功能
        test_key = "health_check"
        result = await limiter.allow(test_key, tokens=1, as_peek=True)

        limiter_type = "redis" if hasattr(limiter, 'get_top_denied') else "memory"

        return {
            "status": "healthy",
            "limiter_type": limiter_type,
            "test_key": test_key,
            "test_result": {
                "allowed": result.allowed,
                "remaining": result.remaining,
                "limit": result.limit
            },
            "features": {
                "distributed": limiter_type == "redis",
                "dynamic_config": hasattr(limiter, 'set_config'),
                "statistics": hasattr(limiter, 'get_stats'),
                "top_denied": hasattr(limiter, 'get_top_denied')
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/summary")
async def get_rate_limit_summary(
    request: Request,
    db: Session = Depends(get_db),
    limiter: RateLimiter = Depends(get_limiter)
):
    """获取限流器总体摘要"""
    require_admin(request, db)

    try:
        limiter_type = "redis" if hasattr(limiter, 'get_top_denied') else "memory"

        summary = {
            "limiter_type": limiter_type,
            "status": "active",
            "features": {
                "distributed": limiter_type == "redis",
                "dynamic_config": hasattr(limiter, 'set_config'),
                "statistics": hasattr(limiter, 'get_stats'),
                "top_denied": hasattr(limiter, 'get_top_denied'),
                "fallback": hasattr(limiter, '_fallback')
            }
        }

        # 如果是Redis限流器，添加额外信息
        if limiter_type == "redis":
            # 获取预定义配置
            config_ids = ["redeem:by_ip", "resend:by_ip", "admin:by_ip"]
            active_configs = []
            for config_id in config_ids:
                if await limiter.get_config(config_id):
                    active_configs.append(config_id)

            summary.update({
                "active_configs": active_configs,
                "config_management": "/api/admin/rate-limit/config",
                "statistics": "/api/admin/rate-limit/stats/{key}",
                "top_denied": "/api/admin/rate-limit/top-denied"
            })

        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取限流摘要失败: {str(e)}")