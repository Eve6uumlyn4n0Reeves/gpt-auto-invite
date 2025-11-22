from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import SessionUsers
from app.services.shared.session_asserts import require_pool_session, require_users_session

logger = logging.getLogger(__name__)


def _phase() -> str:
    return settings.mother_group_migration_phase


ess_msg_duplicate = "用户组名称已存在"


def _ensure_users_session(db_users: Optional[Session]) -> tuple[Session, bool]:
    if db_users is not None:
        require_users_session(db_users)
        return db_users, False
    sess = SessionUsers()
    require_users_session(sess)
    return sess, True


def create(
    db_pool: Session,
    *,
    name: str,
    description: Optional[str],
    team_name_template: Optional[str],
    db_users: Optional[Session] = None,
):
    phase = _phase()
    require_pool_session(db_pool)

    # Pre-check duplicate name on the primary write side to provide fast feedback
    if phase in ("pre", "dual"):
        exists = db_pool.query(models.MotherGroup).filter(models.MotherGroup.name == name.strip()).first()
        if exists:
            raise ValueError(ess_msg_duplicate)
    else:
        u_sess, created = _ensure_users_session(db_users)
        try:
            exists_u = (
                u_sess.query(models.MotherGroupUsers)
                .filter(models.MotherGroupUsers.name == name.strip())
                .first()
            )
            if exists_u:
                raise ValueError(ess_msg_duplicate)
        finally:
            if created:
                u_sess.close()

    if phase == "pre":
        row = models.MotherGroup(
            name=name.strip(),
            description=(description or "").strip() or None,
            team_name_template=team_name_template,
            is_active=True,
        )
        db_pool.add(row)
        db_pool.flush()
        # best-effort sync to settings table for forward compatibility
        try:
            s = (
                db_pool.query(models.MotherGroupSettings)
                .filter(models.MotherGroupSettings.group_id == row.id)
                .first()
            )
            if not s:
                s = models.MotherGroupSettings(group_id=row.id)
            s.team_name_template = team_name_template
            db_pool.add(s)
        except Exception as e:
            logger.debug("mother_group_settings upsert failed on create (pool-only): %s", e)
        db_pool.commit()
        db_pool.refresh(row)
        return row

    if phase == "dual":
        u_sess, created_u = _ensure_users_session(db_users)
        try:
            row_pool = models.MotherGroup(
                name=name.strip(),
                description=(description or "").strip() or None,
                team_name_template=team_name_template,
                is_active=True,
            )
            db_pool.add(row_pool)
            db_pool.flush()  # get id

            row_users = models.MotherGroupUsers(
                id=row_pool.id,
                name=row_pool.name,
                description=row_pool.description,
                team_name_template=row_pool.team_name_template,
                is_active=row_pool.is_active,
            )
            u_sess.add(row_users)
            # first persist to Pool (primary during dual), including settings
            try:
                s = (
                    db_pool.query(models.MotherGroupSettings)
                    .filter(models.MotherGroupSettings.group_id == row_pool.id)
                    .first()
                )
                if not s:
                    s = models.MotherGroupSettings(group_id=row_pool.id)
                s.team_name_template = team_name_template
                db_pool.add(s)
            except Exception as e:
                logger.debug("pool.mother_group_settings upsert failed on create: %s", e)
            db_pool.commit()
            db_pool.refresh(row_pool)

            # then mirror to Users; if Users fails, compensate by removing Pool row
            try:
                s_u = (
                    u_sess.query(models.MotherGroupSettingsUsers)
                    .filter(models.MotherGroupSettingsUsers.group_id == row_pool.id)
                    .first()
                )
                if not s_u:
                    s_u = models.MotherGroupSettingsUsers(group_id=row_pool.id)
                s_u.team_name_template = team_name_template
                u_sess.add(s_u)
                u_sess.commit()
            except Exception:
                logger.error("users commit failed during dual create; compensating by deleting pool row", exc_info=True)
                u_sess.rollback()
                try:
                    # best-effort compensation to keep read-side (pool) clean
                    fresh = db_pool.get(models.MotherGroup, row_pool.id)
                    if fresh:
                        db_pool.delete(fresh)
                        db_pool.commit()
                except Exception:
                    logger.error("compensation delete on pool failed", exc_info=True)
                    db_pool.rollback()
                raise
            return row_pool
        except Exception:
            logger.error("dual-write create failed", exc_info=True)
            db_pool.rollback()
            raise
        finally:
            if created_u:
                u_sess.close()

    if phase in ("cutover", "cleanup"):
        u_sess, created_u = _ensure_users_session(db_users)
        try:
            row_users = models.MotherGroupUsers(
                name=name.strip(),
                description=(description or "").strip() or None,
                team_name_template=team_name_template,
                is_active=True,
            )
            u_sess.add(row_users)
            u_sess.flush()  # get id
            try:
                s_u = (
                    u_sess.query(models.MotherGroupSettingsUsers)
                    .filter(models.MotherGroupSettingsUsers.group_id == row_users.id)
                    .first()
                )
                if not s_u:
                    s_u = models.MotherGroupSettingsUsers(group_id=row_users.id)
                s_u.team_name_template = team_name_template
                u_sess.add(s_u)
            except Exception as e:
                logger.debug("users.mother_group_settings upsert failed on create: %s", e)

            if phase == "cutover":
                # still mirror to pool (best-effort). Keep same id.
                try:
                    row_pool = models.MotherGroup(
                        id=row_users.id,
                        name=row_users.name,
                        description=row_users.description,
                        team_name_template=row_users.team_name_template,
                        is_active=row_users.is_active,
                    )
                    db_pool.add(row_pool)
                    db_pool.flush()
                    try:
                        s = (
                            db_pool.query(models.MotherGroupSettings)
                            .filter(models.MotherGroupSettings.group_id == row_users.id)
                            .first()
                        )
                        if not s:
                            s = models.MotherGroupSettings(group_id=row_users.id)
                        s.team_name_template = team_name_template
                        db_pool.add(s)
                    except Exception as e:
                        logger.debug("pool.mother_group_settings upsert failed on create: %s", e)
                except Exception:
                    logger.error("cutover mirror to pool failed on create", exc_info=True)
                    db_pool.rollback()

            # commit users last to ensure we always have the primary persisted
            u_sess.commit()
            return row_users
        except Exception:
            logger.error("create in users failed (phase=%s)", phase, exc_info=True)
            u_sess.rollback()
            raise
        finally:
            if created_u:
                u_sess.close()


def list_groups(
    db_pool: Session,
    *,
    active_only: bool = False,
    db_users: Optional[Session] = None,
):
    phase = _phase()
    if phase in ("pre", "dual"):
        require_pool_session(db_pool)
        q = db_pool.query(models.MotherGroup)
        if active_only:
            q = q.filter(models.MotherGroup.is_active == True)  # noqa: E712
        return q.order_by(models.MotherGroup.created_at.desc()).all()
    else:
        u_sess, created_u = _ensure_users_session(db_users)
        try:
            q = u_sess.query(models.MotherGroupUsers)
            if active_only:
                q = q.filter(models.MotherGroupUsers.is_active == True)  # noqa: E712
            return q.order_by(models.MotherGroupUsers.created_at.desc()).all()
        finally:
            if created_u:
                u_sess.close()


def get(db_pool: Session, group_id: int, *, db_users: Optional[Session] = None):
    phase = _phase()
    if phase in ("pre", "dual"):
        require_pool_session(db_pool)
        return db_pool.get(models.MotherGroup, group_id)
    else:
        u_sess, created_u = _ensure_users_session(db_users)
        try:
            return u_sess.get(models.MotherGroupUsers, group_id)
        finally:
            if created_u:
                u_sess.close()


def update(
    db_pool: Session,
    group_id: int,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    team_name_template: Optional[str] = None,
    is_active: Optional[bool] = None,
    db_users: Optional[Session] = None,
):
    phase = _phase()

    if phase == "pre":
        require_pool_session(db_pool)
        row = db_pool.get(models.MotherGroup, group_id)
        if not row:
            raise ValueError("母号组不存在")
        if name is not None:
            exists = (
                db_pool.query(models.MotherGroup)
                .filter(models.MotherGroup.name == name.strip(), models.MotherGroup.id != group_id)
                .first()
            )
            if exists:
                raise ValueError(ess_msg_duplicate)
            row.name = name.strip()
        if description is not None:
            row.description = description.strip() or None
        if team_name_template is not None:
            row.team_name_template = team_name_template
            try:
                s = (
                    db_pool.query(models.MotherGroupSettings)
                    .filter(models.MotherGroupSettings.group_id == row.id)
                    .first()
                )
                if not s:
                    s = models.MotherGroupSettings(group_id=row.id)
                s.team_name_template = team_name_template
                db_pool.add(s)
            except Exception as e:
                logger.debug("mother_group_settings sync failed on update: %s", e)
        if is_active is not None:
            row.is_active = is_active
        db_pool.add(row)
        db_pool.commit()
        db_pool.refresh(row)
        return row

    # dual / cutover / cleanup → Users is primary for writes
    u_sess, created_u = _ensure_users_session(db_users)
    try:
        row_u = u_sess.get(models.MotherGroupUsers, group_id)
        if not row_u and phase == "dual":
            # Upsert in users during dual
            row_u = models.MotherGroupUsers(id=group_id)
            u_sess.add(row_u)
            u_sess.flush()
        if not row_u:
            raise ValueError("母号组不存在")

        # enforce unique name in Users side
        if name is not None:
            existing = (
                u_sess.query(models.MotherGroupUsers)
                .filter(models.MotherGroupUsers.name == name.strip(), models.MotherGroupUsers.id != group_id)
                .first()
            )
            if existing:
                raise ValueError(ess_msg_duplicate)
            row_u.name = name.strip()
        if description is not None:
            row_u.description = (description or "").strip() or None
        if team_name_template is not None:
            row_u.team_name_template = team_name_template
            try:
                s_u = (
                    u_sess.query(models.MotherGroupSettingsUsers)
                    .filter(models.MotherGroupSettingsUsers.group_id == group_id)
                    .first()
                )
                if not s_u:
                    s_u = models.MotherGroupSettingsUsers(group_id=group_id)
                s_u.team_name_template = team_name_template
                u_sess.add(s_u)
            except Exception as e:
                logger.debug("users.mother_group_settings sync failed on update: %s", e)
        if is_active is not None:
            row_u.is_active = is_active

        u_sess.add(row_u)
        u_sess.commit()

        if phase in ("dual", "cutover"):
            # mirror to pool (best-effort). Update existing row if present.
            try:
                require_pool_session(db_pool)
                row_p = db_pool.get(models.MotherGroup, group_id)
                if not row_p and phase == "cutover":
                    # create missing mirror in pool during cutover
                    row_p = models.MotherGroup(id=group_id)
                if row_p:
                    if name is not None:
                        # check duplicate in pool
                        dup_p = (
                            db_pool.query(models.MotherGroup)
                            .filter(models.MotherGroup.name == name.strip(), models.MotherGroup.id != group_id)
                            .first()
                        )
                        if dup_p:
                            logger.error("pool mirror update skipped due to name duplicate", extra={"name": name})
                        else:
                            row_p.name = name.strip() if name is not None else row_p.name
                    if description is not None:
                        row_p.description = (description or "").strip() or row_p.description
                    if team_name_template is not None:
                        row_p.team_name_template = team_name_template
                        try:
                            s_p = (
                                db_pool.query(models.MotherGroupSettings)
                                .filter(models.MotherGroupSettings.group_id == group_id)
                                .first()
                            )
                            if not s_p:
                                s_p = models.MotherGroupSettings(group_id=group_id)
                            s_p.team_name_template = team_name_template
                            db_pool.add(s_p)
                        except Exception:
                            logger.debug("pool.mother_group_settings sync failed on update", exc_info=True)
                    if is_active is not None:
                        row_p.is_active = is_active
                    db_pool.add(row_p)
                    db_pool.commit()
            except Exception:
                logger.error("mirror to pool failed on update", exc_info=True)
                db_pool.rollback()
        return row_u
    finally:
        if created_u:
            u_sess.close()


def delete(db_pool: Session, group_id: int, *, db_users: Optional[Session] = None) -> None:
    phase = _phase()
    if phase == "pre":
        require_pool_session(db_pool)
        row = db_pool.get(models.MotherGroup, group_id)
        if not row:
            raise ValueError("用户组不存在")
        mother_count = db_pool.query(models.MotherAccount).filter(models.MotherAccount.group_id == group_id).count()
        if mother_count > 0:
            raise ValueError(f"无法删除：该组内仍有 {mother_count} 个母号")
        db_pool.delete(row)
        db_pool.commit()
        return

    # users primary
    u_sess, created_u = _ensure_users_session(db_users)
    try:
        row_u = u_sess.get(models.MotherGroupUsers, group_id)
        if not row_u:
            raise ValueError("用户组不存在")
        # delete settings if present
        try:
            s_u = (
                u_sess.query(models.MotherGroupSettingsUsers)
                .filter(models.MotherGroupSettingsUsers.group_id == group_id)
                .first()
            )
            if s_u:
                u_sess.delete(s_u)
        except Exception:
            logger.debug("users.mother_group_settings delete failed", exc_info=True)
        u_sess.delete(row_u)
        u_sess.commit()

        if phase in ("dual", "cutover"):
            try:
                require_pool_session(db_pool)
                row_p = db_pool.get(models.MotherGroup, group_id)
                if row_p:
                    mother_count = (
                        db_pool.query(models.MotherAccount)
                        .filter(models.MotherAccount.group_id == group_id)
                        .count()
                    )
                    if mother_count > 0:
                        logger.error("pool mirror delete blocked: mothers exist", extra={"mother_count": mother_count})
                    else:
                        # delete pool settings first
                        try:
                            s_p = (
                                db_pool.query(models.MotherGroupSettings)
                                .filter(models.MotherGroupSettings.group_id == group_id)
                                .first()
                            )
                            if s_p:
                                db_pool.delete(s_p)
                        except Exception:
                            logger.debug("pool.mother_group_settings delete failed", exc_info=True)
                        db_pool.delete(row_p)
                        db_pool.commit()
            except Exception:
                logger.error("mirror to pool failed on delete", exc_info=True)
                db_pool.rollback()
    finally:
        if created_u:
            u_sess.close()

