# 双数据库部署指南（Users / Pool）

目标：将“用户组链路（售卖/兑换码/用户组/管理员会话）”与“号池链路（号池组/序列命名/子号同步）”物理分库，彼此数据不互通。

## 环境变量

- 单库（向后兼容）：
  - `DATABASE_URL`：原有单库地址
- 双库（推荐）：
  - `DATABASE_URL_USERS`：用户组库（缺省回退到 `DATABASE_URL`）
  - `DATABASE_URL_POOL`：号池库（缺省回退到 `DATABASE_URL`）

## 运行时会话路由

- 用户组路由默认使用 Users 库：`get_db()` / `get_db_users()`
- 号池路由使用 Pool 库：`get_db_pool()`
- 集成路由 `/api/admin/import-cookie`：
  - `mode=user` → Users 库
  - `mode=pool` → Pool 库（内部显式使用 Pool 会话）

## Alembic 迁移

Alembic 支持按角色选择目标库：

- 环境变量：`ALEMBIC_DB_ROLE=users|pool`（默认 `users`）
- 示例：

```bash
# 迁移 Users 库
ALEMBIC_DB_ROLE=users DATABASE_URL_USERS=... poetry run alembic upgrade head

# 迁移 Pool 库
ALEMBIC_DB_ROLE=pool DATABASE_URL_POOL=... poetry run alembic upgrade head
```

脚本参考：`cloud/scripts/migrate-users.sh`、`cloud/scripts/migrate-pool.sh`。

## 运行时自检

- 管理后台接口：`GET /api/admin/db-status` 返回 Users/Pool 两个库的连接与 Alembic 版本信息，前端设置页会展示。

## 开发模式（SQLite）

开发环境（`ENV=dev`）下，若目标库为空，系统会针对 Users/Pool 两个引擎分别执行一次 `create_all()` 以便快速起步；生产环境必须使用 Alembic 迁移。

## 注意

- Admin 会话、兑换码、用户组等全部落在 Users 库。
- 号池相关（`PoolGroup*`、`GroupDailySequence`、`ChildAccount` 等）落在 Pool 库。
- 两库表结构相同但数据互不共享；请分别备份与监控。
