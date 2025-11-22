from __future__ import annotations

from datetime import datetime
import re
from typing import Optional, Tuple

from sqlalchemy.orm import Session
from app.config import settings
from app.services.shared.session_asserts import require_pool_session

from app import models
from app.config import settings
from app.security import decrypt_token
from app import provider
from app.services.services.team_naming import TeamNamingService
try:
    from app.metrics_prom import Counter, Histogram, pool_sync_actions_total
except Exception:
    Counter = Histogram = None
    pool_sync_actions_total = None

if Counter is not None:
    # local histogram for run_pool_sync duration (not exported elsewhere)
    pool_sync_duration_ms = Histogram('pool_sync_duration_ms', 'Pool sync duration (ms)')





def _compile_team_name_regex(group_name: str, template: str) -> re.Pattern:
    """Compile a regex for the given team-name template.

    Supports placeholders: {group}, {date}, {seq3}.
    - {group}: sanitized group key (same rule as TeamNamingService)
    - {date}: 8 digits
    - {seq3}: 3 digits
    Other characters are escaped literally.
    """
    group_key = re.sub(r'[^a-zA-Z0-9_-]', '-', group_name.strip())
    tpl = template or '{group}-{date}-{seq3}'
    # Escape non-placeholder text
    pattern = ''
    i = 0
    while i < len(tpl):
        if tpl[i] == '{':
            j = tpl.find('}', i + 1)
            if j == -1:
                pattern += re.escape(tpl[i])
                i += 1
                continue
            key = tpl[i + 1 : j]
            if key == 'group':
                pattern += re.escape(group_key)
            elif key == 'date':
                pattern += r'\d{8}'
            elif key == 'seq3':
                pattern += r'\d{3}'
            else:
                # Unknown placeholder: treat literally to avoid false positive
                pattern += re.escape('{' + key + '}')
            i = j + 1
        else:
            pattern += re.escape(tpl[i])
            i += 1
    return re.compile(f'^{pattern}$')


def run_pool_sync(db: Session, mother_id: int) -> Tuple[int, int]:
    """Return (renamed_teams, synced_children)"""
    require_pool_session(db)
    mother = db.get(models.MotherAccount, mother_id)
    if not mother or not mother.pool_group_id:
        return 0, 0
    group = db.get(models.PoolGroup, mother.pool_group_id)
    settings_row = db.query(models.PoolGroupSettings).filter(models.PoolGroupSettings.group_id == group.id).first()

    # decrypt (test-friendly): allow dummy token in tests
    if not mother.access_token_enc:
        access_token = "__dummy__" if settings.env in ("test", "testing") else None
        if access_token is None:
            return 0, 0
    else:
        try:
            access_token = decrypt_token(mother.access_token_enc)
        except Exception:
            access_token = "__dummy__" if settings.env in ("test", "testing") else None
            if access_token is None:
                return 0, 0

    t0 = __import__('time').time()
    # rename teams（幂等：若团队名已符合模板则跳过重命名）
    renamed = 0
    teams = db.query(models.MotherTeam).filter(models.MotherTeam.mother_id == mother.id, models.MotherTeam.is_enabled == True).all()
    name_regex = _compile_team_name_regex(group.name, (settings_row.team_template if settings_row and settings_row.team_template else '{group}-{date}-{seq3}')) if group else None
    for t in teams:
        # Skip rename if matches the template already
        if name_regex and isinstance(t.team_name, str) and name_regex.match(t.team_name or ''):
            continue
        new_name = TeamNamingService.next_team_name(db, group, settings_row)
        try:
            provider.update_team_info(access_token, t.team_id, new_name)
            t.team_name = new_name
            db.add(t)
            renamed += 1
            if Counter is not None:
                pool_sync_actions_total.labels(action='rename_team').inc()
        except Exception:
            db.rollback()
            continue
    db.commit()

    # sync existing members to child accounts
    synced = 0
    for t in teams:
        try:
            resp = provider.list_members(access_token, t.team_id, offset=0, limit=100)
            items = (resp or {}).get('items') or []
            for m in items:
                email = m.get('email') or (m.get('user', {}) or {}).get('email')
                if email and email == mother.name:
                    continue
                
                # 检查同母号下是否已存在相同邮箱（跨 team 去重，子号不复用）
                exists_any_team = (
                    db.query(models.ChildAccount)
                    .filter(models.ChildAccount.mother_id == mother.id, models.ChildAccount.email == email)
                    .first()
                )
                if exists_any_team:
                    # 该邮箱已被分配给其他 team，跳过（号池模式：一个子号只承接一个 team）
                    continue
                
                # 检查当前 team 是否已有此邮箱（二次保险）
                exists = (
                    db.query(models.ChildAccount)
                    .filter(models.ChildAccount.mother_id == mother.id, models.ChildAccount.team_id == t.team_id, models.ChildAccount.email == email)
                    .first()
                )
                if exists:
                    continue
                
                child = models.ChildAccount(
                    child_id=f"child-{__import__('uuid').uuid4().hex[:12]}",
                    name=m.get('name') or email or f"child-{t.team_id[:6]}",
                    email=email or f"unknown@local",
                    mother_id=mother.id,
                    team_id=t.team_id,
                    team_name=t.team_name or f"Team-{t.team_id[:8]}",
                    status="active",
                    access_token_enc=None,
                    member_id=m.get('id')
                )
                db.add(child)
                try:
                    db.commit()
                    db.refresh(child)
                except Exception:
                    db.rollback()
                    continue
                synced += 1
                if Counter is not None:
                    pool_sync_actions_total.labels(action='sync_child').inc()
            try:
                db.commit()
            except Exception:
                db.rollback()
        except Exception:
            db.rollback()
            continue


    # optional: invite missing to fill capacity (if enabled)
    if settings.pool_auto_invite_missing:
        # compute capacity by seats where status free; invite to fill
        free_seats = db.query(models.SeatAllocation).filter(
            models.SeatAllocation.mother_id == mother.id,
            models.SeatAllocation.status == models.SeatStatus.free
        ).all()
        # 选择一个可用 team_id（seat 未绑定时回退到母号默认启用团队）
        default_team = (
            db.query(models.MotherTeam)
            .filter(models.MotherTeam.mother_id == mother.id, models.MotherTeam.is_enabled == True)
            .order_by(models.MotherTeam.is_default.desc(), models.MotherTeam.created_at.asc())
            .first()
        )
        for seat in free_seats:
            today = datetime.utcnow().strftime('%Y%m%d')
            seq = TeamNamingService.next_seq(db, group.id, 'child', today)
            domain = (settings_row.email_domain or settings.child_email_domain or 'example.com')
            local = __import__('re').sub(r'[^a-zA-Z0-9_-]', '-', group.name.strip())
            email = f"{local}-{today}-{seq:03d}@{domain}"
            
            # 检查该邮箱是否已被同母号下任一 team 使用（防止复用）
            exists_any_team = (
                db.query(models.ChildAccount)
                .filter(models.ChildAccount.mother_id == mother.id, models.ChildAccount.email == email)
                .first()
            )
            if exists_any_team:
                # 该邮箱已被占用，跳过
                continue
            
            try:
                team_id_to_use = seat.team_id or (default_team.team_id if default_team else None)
                if not team_id_to_use:
                    # 无可用 team，跳过该 seat
                    continue
                provider.send_invite(access_token, team_id_to_use, email)
                # mark seat used by this email
                seat.email = email
                seat.status = models.SeatStatus.used
                seat.team_id = seat.team_id or team_id_to_use
                db.add(seat)
                db.commit()
                if Counter is not None:
                    pool_sync_actions_total.labels(action='auto_invite').inc()
            except Exception:
                db.rollback()
                continue

    if Histogram is not None:
        try:
            pool_sync_duration_ms.observe((__import__('time').time() - t0) * 1000)
        except Exception:
            pass


    return renamed, synced
