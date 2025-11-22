"""
自动化母号录入路由

提供从浏览器Cookie到完整母号+子号录入的自动化API接口。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.schemas import (
    AutoIngestRequest,
    AutoIngestResponse,
    CookieValidationRequest,
    CookieValidationResponse
)
from app.services.services.auto_mother_ingest import create_auto_mother_ingest_service
from app.provider import fetch_session_via_cookie
from app import models
from app.services.services import audit as audit_svc
from .dependencies import get_db_pool, get_db, require_admin, admin_ops_rate_limit_dep, require_domain
from app.utils.csrf import require_csrf_token

router = APIRouter()


@router.post("/auto-ingest/validate-cookie", response_model=CookieValidationResponse)
async def validate_cookie(
    payload: CookieValidationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    验证Cookie有效性

    在正式录入前验证Cookie是否有效，返回母号基础信息供确认。
    """
    require_admin(request, db)
    # 只读接口，不强制域检查

    try:
        # 解析Cookie获取基础信息
        access_token, expires_at, email, account_id = fetch_session_via_cookie(payload.cookie_string)

        return CookieValidationResponse(
            valid=True,
            email=email,
            account_id=account_id,
            expires_at=expires_at
        )

    except Exception as e:
        return CookieValidationResponse(
            valid=False,
            error=str(e),
            error_type=type(e).__name__
        )


@router.post("/auto-ingest", response_model=AutoIngestResponse)
async def auto_ingest_mother(
    payload: AutoIngestRequest,
    request: Request,
    pool_db: Session = Depends(get_db_pool),
    users_db: Session = Depends(get_db),
    _: None = Depends(admin_ops_rate_limit_dep),
):
    """
    自动化母号录入

    简化的自动化录入流程：
    1. 解析Cookie获取母号信息和当前team_id
    2. 分配到号池组（新建或现有）
    3. 创建母号记录和team记录
    """
    require_admin(request, users_db)
    await require_domain('pool')(request)
    await require_csrf_token(request)

    try:
        # 验证参数
        if payload.pool_group_id and payload.pool_group_name:
            raise HTTPException(status_code=400, detail="不能同时指定pool_group_id和pool_group_name")

        # 创建自动化录入服务
        ingest_service = create_auto_mother_ingest_service(pool_db)

        # 执行自动化录入
        result = ingest_service.ingest_from_cookie(
            cookie_string=payload.cookie_string,
            pool_group_id=payload.pool_group_id,
            pool_group_name=payload.pool_group_name
        )

        # 记录审计日志
        try:
            if result["success"]:
                audit_svc.log(
                    users_db,
                    actor="admin",
                    action="auto_ingest_mother",
                    target_type="mother",
                    target_id=str(result["mother"]["id"]) if result.get("mother") else None,
                    details=f"Auto-ingested mother: {result['mother']['email'] if result.get('mother') else 'unknown'}"
                )
            else:
                audit_svc.log(
                    users_db,
                    actor="admin",
                    action="auto_ingest_mother_failed",
                    target_type="system",
                    details=f"Auto-ingest failed: {result.get('error', 'unknown error')}"
                )
        except Exception:
            pass  # 审计失败不影响主流程

        return AutoIngestResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        # 记录错误审计日志
        try:
            audit_svc.log(
                users_db,
                actor="admin",
                action="auto_ingest_mother_failed",
                target_type="system",
                details=f"Auto-ingest failed: {str(e)}"
            )
        except Exception:
            pass

        raise HTTPException(status_code=500, detail=f"自动化录入失败: {str(e)}")


@router.get("/auto-ingest/current-team")
async def get_current_team_info(
    request: Request,
    cookie_string: str,
    pool_db: Session = Depends(get_db_pool),
    users_db: Session = Depends(get_db),
):
    """
    获取当前Cookie对应的Team信息

    在录入前预览Cookie对应的母号和team信息。
    """
    require_admin(request, users_db)

    try:
        from app.provider import fetch_session_via_cookie

        # 解析Cookie获取信息
        access_token, expires_at, email, team_id = fetch_session_via_cookie(cookie_string)

        return {
            "valid": True,
            "email": email,
            "team_id": team_id,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "has_token": bool(access_token)
        }

    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
            "error_type": type(e).__name__
        }


@router.get("/auto-ingest/templates")
def get_naming_templates(
    request: Request,
    pool_db: Session = Depends(get_db_pool),
    users_db: Session = Depends(get_db),
):
    """
    获取号池组相关的信息

    返回可用的号池组列表和基本信息。
    """
    require_admin(request, users_db)

    # 获取可用的号池组
    pool_groups = pool_db.query(models.PoolGroup).filter(
        models.PoolGroup.is_active == True
    ).all()

    return {
        "pool_groups": [
            {
                "id": pg.id,
                "name": pg.name,
                "description": pg.description
            }
            for pg in pool_groups
        ],
        "usage_notes": {
            "cookie_source": "在ChatGPT页面按F12 -> Application -> Cookies -> 复制完整的Cookie字符串",
            "pool_group_selection": "可选择现有号池组或创建新的号池组",
            "auto_creation": "系统会自动创建母号记录和team记录，后续可用于邀请操作"
        }
    }


__all__ = ["router"]