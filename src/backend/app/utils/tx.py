from __future__ import annotations

from contextlib import contextmanager
from sqlalchemy.orm import Session


@contextmanager
def atomic(session: Session):
    """
    简单的事务上下文：
    - 正常退出时调用 `session.commit()`
    - 捕获异常时回滚并继续抛出
    用于消除重复的 try/commit/except/rollback 模式。
    """
    try:
        yield
        session.commit()
    except Exception:
        session.rollback()
        raise

