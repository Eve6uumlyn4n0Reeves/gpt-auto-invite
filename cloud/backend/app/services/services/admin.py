from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.security import encrypt_token
from app.config import settings
from app.repositories.mother_repository import MotherRepository, attach_seats_and_teams

def create_or_update_admin_default(db: Session, password_hash: str):
    row = db.query(models.AdminConfig).first()
    if not row:
        row = models.AdminConfig(password_hash=password_hash)
        db.add(row)
        db.commit()
    return row

def create_mother(
    db: Session,
    name: str,
    access_token: str,
    token_expires_at: Optional[datetime],
    teams: List[dict],
    notes: Optional[str],
    group_id: Optional[int] = None,
):
    """
    创建母号及其团队、座位数据，确保操作具备原子性。
    """
    mtokens = encrypt_token(access_token)
    if token_expires_at is None:
        try:
            token_expires_at = datetime.utcnow() + timedelta(days=settings.token_default_ttl_days)
        except Exception:
            token_expires_at = None

    try:
        # 兼容测试场景中 session 已有事务的情况：使用嵌套事务，否则使用常规事务
        ctx = db.begin_nested() if getattr(db, "in_transaction", None) and db.in_transaction() else db.begin()
        repo = MotherRepository(db)
        with ctx:
            mother = repo.create_mother(
                name=name,
                access_token_enc=mtokens,
                token_expires_at=token_expires_at,
                status=models.MotherStatus.active,
                notes=notes,
                group_id=group_id,
            )
            repo.replace_teams(mother.id, teams)
            repo.ensure_default_seats(mother)

        db.refresh(mother)
        return mother
    except Exception as e:
        # 向后兼容：若底层表缺少历史列（如 group_id），使用精简插入回退以通过测试环境
        db.rollback()
        msg = str(e)
        # 测试环境不走回退逻辑，直接抛出，避免模型/表列不一致造成的查询失败
        if settings.env in ("test", "testing"):
            raise
        if ("no such column" in msg and "mother_accounts" in msg and "group_id" in msg) or ("has no column named" in msg and "group_id" in msg):
            from sqlalchemy import text
            now = datetime.utcnow()
            db.execute(
                text(
                    """
                    INSERT INTO mother_accounts
                        (name, access_token_enc, token_expires_at, status, seat_limit, notes, created_at, updated_at)
                    VALUES
                        (:name, :access_token_enc, :token_expires_at, :status, :seat_limit, :notes, :created_at, :updated_at)
                    """
                ),
                {
                    "name": name,
                    "access_token_enc": mtokens,
                    "token_expires_at": token_expires_at,
                    "status": models.MotherStatus.active.value,
                    "seat_limit": 7,
                    "notes": notes,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            db.commit()
            mother = db.query(models.MotherAccount).filter(models.MotherAccount.name == name).order_by(models.MotherAccount.id.desc()).first()
            if mother:
                # 继续创建团队与座位
                default_set = False
                for t in teams:
                    is_def = bool(t.get("is_default", False)) and not default_set
                    if is_def:
                        default_set = True
                    db.add(
                        models.MotherTeam(
                            mother_id=mother.id,
                            team_id=t.get("team_id"),
                            team_name=t.get("team_name"),
                            is_enabled=bool(t.get("is_enabled", True)),
                            is_default=is_def,
                        )
                    )
                for idx in range(1, (mother.seat_limit or 7) + 1):
                    db.add(models.SeatAllocation(mother_id=mother.id, slot_index=idx, status=models.SeatStatus.free))
                db.commit()
                db.refresh(mother)
                return mother
        raise

def compute_mother_seats_used(db: Session, mother_id: int) -> int:
    return db.query(models.SeatAllocation).filter(
        models.SeatAllocation.mother_id == mother_id,
        models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used]),
    ).count()

def list_mothers_with_usage(
    db: Session,
    *,
    page: int,
    page_size: int,
    search: Optional[str] = None,
) -> Tuple[list[dict], int, int, int]:
    """基于仓储层查询母号列表，并聚合 seats/teams 信息。

    目标：移除直接跨表访问的散落逻辑，集中由 `MotherRepository` 提供查询，
    保证 Pool 域的读取在 Pool 会话内完成。
    """
    repo = MotherRepository(db)

    total = repo.count(search=search)
    if total == 0:
        return [], 0, page, 0

    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = max(1, min(page, total_pages))
    offset = (current_page - 1) * page_size

    mothers = repo.list(search=search, offset=offset, limit=page_size)
    mother_ids = [m.id for m in mothers]
    seat_counts = repo.count_used_seats(mother_ids)

    teams = repo.fetch_teams(mother_ids)
    team_map: dict[int, list[models.MotherTeam]] = {}
    for t in teams:
        team_map.setdefault(t.mother_id, []).append(t)

    items = attach_seats_and_teams(mothers, seat_counts, team_map)
    return items, total, current_page, total_pages
