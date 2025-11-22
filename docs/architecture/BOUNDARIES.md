## 代码域边界（Users vs Pool）

> **最新约束（2025-11）**  
> - Users 域与 Pool 域必须彻底解耦：常规业务代码禁止同时访问两个数据库，也禁止直接操作对方 ORM。  
> - 若确需跨域协作，必须通过显式的“跨域 API / 集成服务”完成，而不是共享 Session。当前阶段要求白名单为空，即不再保留跨库业务。  
> - `provider.py` 一类的无状态工具可以在两个域之间共享，但不得导入任何 ORM / Session。

本表列出了当前仓库中已经存在的主要模块，并标注它们应该归属于哪一条业务链路（Users 域 or Pool 域）。在最新约束下，表中任意模块都不应再引用另一域的 Session；若发现引用，请将该模块迁移或拆分。

### Users 域（兑换／邀请码／队列）

- `src/backend/app/database.py` 中的 `BaseUsers`, `SessionUsers`
- `src/backend/app/models.py`：
  - `InviteRequest`, `RedeemCode`, `Admin*`, `AuditLog`, `BulkOperationLog`, `BatchJob`, `SwitchRequest` 等所有 Users ORM
- `src/backend/app/repositories/users_repository.py` 及其依赖
- `src/backend/app/services/services/*` 中与兑换、切换、批量任务、限流、维护等直接读写 Users DB 的服务：
  - `invites.py`, `switch.py`, `redeem.py`, `maintenance.py`, `jobs.py`, `rate_limiter_service.py`
- `src/backend/app/routers` 目录下所有 `public` 接口、`admin/codes.py`, `admin/users.py`, `admin/jobs.py`, `admin/switch.py`, `admin/batch.py`, `admin/performance.py`, `admin/system.py`, `admin/audit.py` 等只依赖 Users 数据的路由
- `src/backend/app/middleware` 中与 CSRF、安全头、速率等通用逻辑（需要拆一份 Users 侧副本，禁止引用 Pool ORM）
- `src/backend/app/config.py` 中与 Users 服务运行相关的配置（后续将抽离成共享 + Users 专属段）
- Alembic：`src/backend/alembic_users/*`
- 测试：`src/backend/tests/test_admin_routes_unique.py`, `test_admin_users_cross_db.py`, `test_invite_service_cross_db.py`, `test_codes_*`, `test_switch_*`, `test_jobs_*`, `test_rate_limit_*` 等

### Pool 域（母号／号池组／Pool API）

- `src/backend/app/database.py` 中的 `BasePool`, `SessionPool`
- `src/backend/app/models.py`：
  - `MotherAccount`, `MotherTeam`, `SeatAllocation`, `ChildAccount`, `MotherGroup*`, `PoolGroup*`, `MotherStatus`, `SeatStatus` 等所有 Pool ORM
- `src/backend/app/models_pool_api.py`
- `src/backend/app/repositories/mother_repository.py` 及所有 `Mother` / `Pool` 专用仓储
- `src/backend/app/services/services/*` 中专属 Pool 的服务：
  - `mother_command.py`, `mother_group_service.py`（Pool 侧部分）, `pool_group.py`, `pool.py`, `team_naming.py`, `auto_mother_ingest.py`, `pool_member_service.py`, `pool_swap_service.py`, `pool_api_key_service.py`, `provider.py`
- `src/backend/app/routers` 目录下与母号、子号、号池、Pool API 相关的路由：
  - `routers/admin/mother_*`, `routers/admin/pool_groups.py`, `routers/admin/integrations.py`（pool 模式）、`routers/admin/children.py`, `routers/pool_api.py`, `routers/routers/mother_ingest_public.py`
- `src/backend/app/middleware/pool_api_auth.py`、`Pooling` 相关 utils
- Alembic：`src/backend/alembic_pool/*`
- 测试：`test_mother_*`, `test_pool_*`, `test_children_*`, `test_pool_group_*`, `test_auto_ingest_*`

### 共享/无状态工具

- `app/provider.py`、`app/security.py`、`app/utils/*`、`app/middleware/security_headers.py`、`app/middleware/input_validation.py` 等与域无关的通用库。  
- 这些模块只能依赖配置、metrics 或轻量工具，不得导入任何 ORM / Session。若需要访问数据库，请在对应域新建专用模块。  
- 配置解析需要拆成三部分：公共 `base_settings.py` + `users_settings.py` + `pool_settings.py`，避免互相读取对方的 env。  
- `app/utils/error_handler.py`, `app/utils/csrf.py`, `app/utils/perf` 等仍可保留，但要防止它们隐式导入跨域模型。
- 详细的 provider 共享准则见 `docs/architecture/PROVIDER_SHARED_GUIDE.md`。

> 注意：当前阶段没有任何允许的跨域白名单。若必须临时跨域，请先在 `docs/architecture/BOUNDARIES.md` 内新增“例外记录”并说明退场计划，再提交代码；否则 CI 会阻止合并。

### 强制守卫（STRICT_DOMAIN_GUARD）

- 环境变量 `STRICT_DOMAIN_GUARD=true` 时，`users_app` 只能访问 `SessionUsers`，`pool_app` 只能访问 `SessionPool`；一旦越界，将抛出运行时错误。  
- `app/application.py` 会在启动时调用 `set_service_domain`，`app/database.py` 的 `get_db*` 会通过 `ensure_domain_allows` 进行检查。  
- 默认值 `false` 便于渐进迁移；完成解耦后建议在 CI / 生产同时开启。

