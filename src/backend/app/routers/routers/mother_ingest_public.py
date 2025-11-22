"""
母号录入的公共路由

提供给前端使用的公共接口，主要用于cookie检测和基本信息验证
不包含管理功能
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.database import get_db_pool
from app.provider import fetch_session_via_cookie, ProviderError
from app.services.services.rate_limiter_service import get_rate_limiter, ip_strategy
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit

router = APIRouter(prefix="/api/public/ingest", tags=["public", "ingest"])


async def _get_rate_limiter():
    return await get_rate_limiter()


async def ingest_public_rate_limit(request: Request, limiter=Depends(_get_rate_limiter)):
    dependency = rate_limit(limiter, ip_strategy, config_id="public-ingest:by_ip")
    await dependency(request)


class CookieValidationRequest(BaseModel):
    """Cookie验证请求"""
    cookie: str = Field(..., description="完整的cookie字符串")


class CookieValidationResponse(BaseModel):
    """Cookie验证响应"""
    valid: bool
    email: Optional[str] = None
    team_id: Optional[str] = None
    token_expires_at: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None


@router.post("/validate-cookie", response_model=CookieValidationResponse)
async def validate_cookie(
    request: CookieValidationRequest,
    db: Session = Depends(get_db_pool),
    _: None = Depends(ingest_public_rate_limit),
):
    """
    验证cookie并获取基本信息

    这个接口可以用于前端在提交前验证cookie的有效性
    不会将数据存入数据库，仅用于验证
    """
    try:
        # 尝试获取session信息
        access_token, token_expires_at, email, team_id = fetch_session_via_cookie(request.cookie)

        return CookieValidationResponse(
            valid=True,
            email=email,
            team_id=team_id,
            token_expires_at=token_expires_at.isoformat() if token_expires_at else None,
            message="Cookie验证成功"
        )

    except ProviderError as e:
        return CookieValidationResponse(
            valid=False,
            error=f"ProviderError: {e.code}",
            message=f"Cookie验证失败: {e.message}"
        )
    except Exception as e:
        return CookieValidationResponse(
            valid=False,
            error="validation_failed",
            message=f"验证过程中发生错误: {str(e)}"
        )


@router.get("/group-types")
async def get_group_types(_: None = Depends(ingest_public_rate_limit)):
    """获取支持的分组类型"""
    return {
        "user_group": {
            "name": "用户组",
            "description": "用于售卖的母号管理，支持兑换码系统",
            "features": ["席位管理", "兑换码生成", "用户绑定", "自动命名"]
        },
        "pool_group": {
            "name": "号池组",
            "description": "用于自己管理的母号池，支持自动化子号管理",
            "features": ["子号管理", "批量命名", "自动拉子号", "团队管理"]
        }
    }


@router.get("/naming-templates")
async def get_naming_templates(_: None = Depends(ingest_public_rate_limit)):
    """获取常用的命名模板"""
    from app.services.services.team_naming import DEFAULT_TEMPLATES

    return {
        "templates": DEFAULT_TEMPLATES,
        "variables": [
            {"name": "{email_prefix}", "description": "邮箱前缀"},
            {"name": "{email}", "description": "完整邮箱"},
            {"name": "{date}", "description": "日期 (YYYYMMDD)"},
            {"name": "{time}", "description": "时间 (HHMM)"},
            {"name": "{datetime}", "description": "日期时间 (YYYYMMDD_HHMM)"},
            {"name": "{sequence}", "description": "序列号 (3位)"},
            {"name": "{year}", "description": "年份"},
            {"name": "{month}", "description": "月份"},
            {"name": "{day}", "description": "日期"},
            {"name": "{group}", "description": "分组名称 (号池组专用)"},
            {"name": "{seq3}", "description": "3位序列号 (号池组专用)"}
        ]
    }


@router.post("/preview-naming")
async def preview_naming(
    template: str,
    email: str = "test@example.com",
    group_type: str = "user_group",
    group_name: str = "TestGroup",
    _: None = Depends(ingest_public_rate_limit),
):
    """预览命名效果"""
    import re
    from datetime import datetime

    # 准备变量
    email_prefix = email.split('@')[0]
    date_str = datetime.now().strftime('%Y%m%d')
    time_str = datetime.now().strftime('%H%M')
    group_key = re.sub(r'[^a-zA-Z0-9_-]', '-', group_name.strip())

    variables = {
        '{email_prefix}': email_prefix,
        '{email}': email,
        '{date}': date_str,
        '{time}': time_str,
        '{datetime}': f"{date_str}_{time_str}",
        '{sequence}': "001",
        '{year}': datetime.now().strftime('%Y'),
        '{month}': datetime.now().strftime('%m'),
        '{day}': datetime.now().strftime('%d'),
    }

    # 号池组特有变量
    if group_type == "pool_group":
        variables.update({
            '{group}': group_key,
            '{seq3}': "001"
        })

    # 执行替换
    result = template
    for var, value in variables.items():
        result = result.replace(var, str(value))

    # 清理非法字符
    result = re.sub(r'[^\w\s\u4e00-\u9fff\-_.]', '', result)
    result = result.strip(' _-')

    return {
        "template": template,
        "variables": variables,
        "result": result or f"Team-{email_prefix}-{date_str}",
        "group_type": group_type
    }
