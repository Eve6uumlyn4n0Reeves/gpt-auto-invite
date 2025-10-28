# Dual Alembic (Users/Pool)

Commands:

- Users DB:
  - `ALEMBIC_CONFIG=cloud/backend/alembic_users.ini alembic revision -m "..." --autogenerate`
  - `ALEMBIC_CONFIG=cloud/backend/alembic_users.ini alembic upgrade head`

- Pool DB:
  - `ALEMBIC_CONFIG=cloud/backend/alembic_pool.ini alembic revision -m "..." --autogenerate`
  - `ALEMBIC_CONFIG=cloud/backend/alembic_pool.ini alembic upgrade head`

Notes:
- `env.py` reads runtime URLs from `app.config.settings` (`DATABASE_URL_USERS`, `DATABASE_URL_POOL`).
- Cross‑DB FKs are removed in ORM; enforce via 应用层校验与任务对账。
- 开发/测试环境 `init_db()` 仅在空库时对两库分别 `create_all()`。
