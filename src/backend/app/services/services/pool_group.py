from __future__ import annotations

import json
from http import HTTPStatus
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

# 会话归属断言：严格限制本文件只对 Pool 会话进行写入；
# BatchJob 仅允许写入 Users 会话。
from app.services.shared.session_asserts import require_pool_session, require_users_session

from app import models
from app.services.services.team_naming import TeamNamingService
from app.utils.tx import atomic
from app.utils.error_handler import (
    BusinessError,
    ErrorCode,
    MotherNotFoundError,
    PoolGroupNotFoundError,
    ValidationError as DomainValidationError,
)
try:
    from app.metrics_prom import pool_sync_actions_total
except Exception:
    pool_sync_actions_total = None
from app.utils.locks import try_acquire_lock, release_lock


def create_pool_group(
    session: Session,
    *,
    name: str,
    description: Optional[str] = None,
) -> models.PoolGroup:
    """Create a pool group alongside its default settings entry."""
    require_pool_session(session)
    row = models.PoolGroup(
        name=name.strip(),
        description=(description or "").strip() or None,
        is_active=True,
    )
    with atomic(session):
        session.add(row)
        session.flush()  # ensure row.id is available
        settings = models.PoolGroupSettings(group_id=row.id)
        session.add(settings)
    session.refresh(row)
    return row


def list_pool_groups(session: Session) -> List[models.PoolGroup]:
    """Return all pool groups ordered by creation time."""
    require_pool_session(session)
    return (
        session.query(models.PoolGroup)
        .order_by(models.PoolGroup.created_at.desc())
        .all()
    )


def update_pool_group_settings(
    session: Session,
    group_id: int,
    *,
    team_template: Optional[str] = None,
    child_name_template: Optional[str] = None,
    child_email_template: Optional[str] = None,
    email_domain: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> models.PoolGroupSettings:
    """Upsert pool group settings for the given group."""
    require_pool_session(session)
    def _validate_template(tpl: Optional[str]) -> None:
        # 统一由 TeamNamingService 校验，占位符限定在号池域允许集合
        try:
            TeamNamingService.validate_placeholders(tpl, {"group", "date", "seq3", "domain"})
        except ValueError as exc:
            # 为兼容现有测试与调用方预期，抛出 ValueError 而非领域自定义异常
            raise ValueError(str(exc)) from exc
    group = session.get(models.PoolGroup, group_id)
    if not group:
        raise PoolGroupNotFoundError(group_id)

    settings = (
        session.query(models.PoolGroupSettings)
        .filter(models.PoolGroupSettings.group_id == group_id)
        .first()
    )
    if not settings:
        settings = models.PoolGroupSettings(group_id=group_id)

    if team_template is not None:
        _validate_template(team_template)
        settings.team_template = team_template or None
    if child_name_template is not None:
        _validate_template(child_name_template)
        settings.child_name_template = child_name_template or None
    if child_email_template is not None:
        _validate_template(child_email_template)
        settings.child_email_template = child_email_template or None
    if email_domain is not None:
        settings.email_domain = email_domain or None
    if is_active is not None:
        settings.is_active = bool(is_active)

    with atomic(session):
        session.add(settings)
    session.refresh(settings)
    return settings


def preview_pool_group_names(
    session: Session,
    group_id: int,
    *,
    samples: int = 3,
) -> List[str]:
    """Generate sample team names for a pool group using its settings."""
    require_pool_session(session)
    group = session.get(models.PoolGroup, group_id)
    if not group:
        raise PoolGroupNotFoundError(group_id)
    settings = (
        session.query(models.PoolGroupSettings)
        .filter(models.PoolGroupSettings.group_id == group_id)
        .first()
    )
    names: List[str] = []
    for _ in range(max(samples, 1)):
        names.append(TeamNamingService.next_team_name(session, group, settings))
    return names


def enqueue_pool_group_sync(
    pool_session: Session,
    users_session: Session,
    *,
    mother_id: int,
    group_id: int,
) -> models.BatchJob:
    """Link a mother to a pool group and enqueue a sync job in the Users DB.

    业务分离约束：
    - 所有母号/组写入仅允许发生在 Pool 会话中；
    - 任务实体（BatchJob）仅允许写入 Users 会话中；
    - 去重：若存在相同 (mother_id, group_id) 的 pending/running 任务，则直接返回该任务。
    """
    require_pool_session(pool_session)
    require_users_session(users_session)
    mother = pool_session.get(models.MotherAccount, mother_id)
    if not mother:
        raise MotherNotFoundError(mother_id)
    group = pool_session.get(models.PoolGroup, group_id)
    if not group:
        raise PoolGroupNotFoundError(group_id)
    if not group.is_active:
        raise BusinessError(
            message=f"号池组 {group_id} 未激活",
            error_code=ErrorCode.POOL_GROUP_ALREADY_EXISTS,
            status_code=HTTPStatus.BAD_REQUEST,
            details={"pool_group_id": group_id, "status": "inactive"},
        )

    previous_group = mother.pool_group_id
    mother.pool_group_id = group_id
    try:
        pool_session.add(mother)
        pool_session.commit()
    except Exception:
        pool_session.rollback()
        raise

    # 任务去重：先做 SQL 级预筛（LIKE + 状态过滤），再做 JSON 精确匹配；配合短时分布式锁减少竞态
    lock_client = None
    lock_token = None
    lock_name = f"pool_sync:{int(mother_id)}:{int(group_id)}"
    try:
        lock_client, lock_token = try_acquire_lock(lock_name, ttl_seconds=60)
    except Exception:
        lock_client, lock_token = None, None

    # 预筛已有候选（仅按类型与状态过滤，避免 JSON 格式差异导致 LIKE 失配）
    candidates = (
        users_session.query(models.BatchJob)
        .filter(
            models.BatchJob.job_type == models.BatchJobType.pool_sync_mother,
            models.BatchJob.status.in_([models.BatchJobStatus.pending, models.BatchJobStatus.running]),
        )
        .order_by(models.BatchJob.created_at.desc())
        .all()
    )
    for j in candidates:
        try:
            p = json.loads(j.payload_json or "{}")
            if int(p.get("mother_id", -1)) == int(mother_id) and int(p.get("group_id", -1)) == int(group_id):
                try:
                    if pool_sync_actions_total is not None:
                        pool_sync_actions_total.labels(action='enqueue', result='reuse').inc()
                except Exception:
                    pass
                return j
        except Exception:
            continue

    payload = {"mother_id": mother_id, "group_id": group_id}
    job = models.BatchJob(
        job_type=models.BatchJobType.pool_sync_mother,
        status=models.BatchJobStatus.pending,
        actor="admin",
        payload_json=json.dumps(payload, ensure_ascii=False),
    )
    try:
        users_session.add(job)
        users_session.commit()
        users_session.refresh(job)
        try:
            if pool_sync_actions_total is not None:
                pool_sync_actions_total.labels(action='enqueue', result='created').inc()
        except Exception:
            pass
        return job
    except Exception:
        users_session.rollback()
        # attempt to revert pool group assignment if job creation failed
        try:
            mother.pool_group_id = previous_group
            pool_session.add(mother)
            pool_session.commit()
        except Exception:
            pool_session.rollback()
        try:
            if pool_sync_actions_total is not None:
                pool_sync_actions_total.labels(action='enqueue', result='error').inc()
        except Exception:
            pass
        raise
    finally:
        # 释放锁
        try:
            release_lock(lock_client, lock_name, lock_token)
        except Exception:
            pass
