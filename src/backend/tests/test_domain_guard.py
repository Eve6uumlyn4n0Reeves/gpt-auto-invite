import pytest
from unittest import mock

from app import domain_context
from app.config import settings
from app.database import get_db_pool, get_db_users
from app.domain_context import ServiceDomain


class _DummySession:
    def close(self):
        pass


def _set_guard(enabled: bool):
    prev = settings.strict_domain_guard
    settings.strict_domain_guard = enabled
    return prev


def test_users_domain_blocks_pool_session():
    prev_guard = _set_guard(True)
    domain_context.set_service_domain(ServiceDomain.users)
    with mock.patch("app.database.SessionPool", return_value=_DummySession()):
        try:
            gen = get_db_pool()
            with pytest.raises(RuntimeError):
                next(gen)
        finally:
            domain_context.set_service_domain(ServiceDomain.monolith)
            settings.strict_domain_guard = prev_guard


def test_pool_domain_blocks_users_session():
    prev_guard = _set_guard(True)
    domain_context.set_service_domain(ServiceDomain.pool)
    with mock.patch("app.database.SessionUsers", return_value=_DummySession()):
        try:
            gen = get_db_users()
            with pytest.raises(RuntimeError):
                next(gen)
        finally:
            domain_context.set_service_domain(ServiceDomain.monolith)
            settings.strict_domain_guard = prev_guard


def test_monolith_allows_both_when_guard_enabled():
    prev_guard = _set_guard(True)
    domain_context.set_service_domain(ServiceDomain.monolith)
    with mock.patch("app.database.SessionUsers", return_value=_DummySession()), mock.patch(
        "app.database.SessionPool", return_value=_DummySession()
    ):
        try:
            users_gen = get_db_users()
            pool_gen = get_db_pool()
            next(users_gen)
            next(pool_gen)
        finally:
            try:
                users_gen.close()
            except Exception:
                pass
            try:
                pool_gen.close()
            except Exception:
                pass
            settings.strict_domain_guard = prev_guard

