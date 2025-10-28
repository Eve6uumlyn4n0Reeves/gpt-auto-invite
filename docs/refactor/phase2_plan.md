# 阶段二候选改造方案

## 1. maintenance 服务

### 状态
- ✅ 已引入 `MaintenanceService`，并在 `app/main.py` 中通过 Users / Pool 双会话调用。
- ✅ `cleanup_stale_held`、`cleanup_expired_mother_teams`、`sync_invite_acceptance` 已迁移至仓储化实现，`test_jobs_and_sync` 等用例覆盖成功。
- ⏱️ 后续需补充 provider 调用的监控与告警，评估更多失败场景。

## 2. child_account 服务

### 状态
- ✅ 已重构为 `ChildAccountService` 实例，依赖 `PoolRepository`，内部操作改为显式提交/回滚。
- ⏱️ 仍需梳理实际调用方，按需注入 `create_child_account_service` 并补充端到端测试。
- ⏱️ 监控与 provider 调用的错误处理（日志/指标）待加强。

## 3. admin 服务（后续）
- `create_mother` / `list_mothers_with_usage` 仍在 Users 会话中直接构造母号与团队，应拆分成 Pool 仓储操作 + Users 侧投影。
- 需要结合领域模型拆分计划执行，暂列为阶段二后续任务。

### JobRunner / 批处理
- ✅ `JobRunner` 引入显式会话注入（Users + Pool），`process_one_job` 仅为薄封装。
- ✅ `/api/admin/jobs` 由 `admin_jobs` 服务统一返回 DTO，并支持重试。
- ⏱️ 后续需补充“取消任务”“筛选 job_type/时间范围”等接口，完善前端看板需求。

## 阶段二：API 路由拆分与领域模型计划

### 当前局限
- `cloud/backend/app/routers/admin/mothers.py`、`.../integrations.py` 仍通过 `get_db` (Users 库) 调用 `create_mother` 等函数，内部直接写 Pool 实体。
- `create_mother` 在 `app/services/services/admin.py` 中混用 `MotherAccount`、`MotherTeam`、`SeatAllocation`（Pool 库）与 `InviteRequest`（Users），缺乏仓储边界。
- 批处理与统计路由 (`admin/batch.py`, `admin/codes.py`, `routers/stats.py`) 同样在 Users 会话里查询 Pool 模型。

### 拆分目标
1. **服务层**：拆出 `MotherRepository`（Pool）与 `InviteRepository`（Users），重构 `create_mother` / `list_mothers_with_usage` 等函数。
2. **路由层**：为母号、统计、导入等接口提供双会话依赖（Users + Pool），或拆成两个微服务端点。
3. **集成场景**：`admin/integrations.py` 需更严格地区分池模式与用户模式的会话使用；`jobs.py` pool_sync 流程需确保异步会话正确关闭。

### 行动建议
- 先设计仓储接口与 DTO，将 `MotherAccount` 相关操作迁移到 Pool 仓储，使用 Users 仓储构建列表/投影。
- 调整 admin 路由依赖：注入 `get_db` (Users) + `get_db_pool` (Pool)，并在路由内实例化服务。
- 更新批处理、统计等使用 Pool 数据的路由，确保全部通过 Pool 仓储访问。

## 2025-10-28 审计摘要

- **领域模型边界**：`MotherAccount`、`MotherTeam`、`SeatAllocation` 等核心实体仍继承 `BasePool`（`cloud/backend/app/models.py:119` 起），确认拆分后应仅通过 Pool 会话访问。
- **服务层跨库写操作**：
  - `create_mother` 直接在 Users 会话里构造 `MotherAccount`/`MotherTeam`/`SeatAllocation`（`cloud/backend/app/services/services/admin.py:22-133`），需改为 Pool 仓储写入并返回 DTO。
  - `list_mothers_with_usage` 同样在 Users 会话中聚合 Pool 表（`cloud/backend/app/services/services/admin.py:144-200`），后续应复用 Pool 仓储查询 + Users 仓储投影。
- **路由依赖单一会话**：
  - 管理端母号路由 `GET /api/admin/mothers`、批量导入等均只注入 `get_db`（Users）（`cloud/backend/app/routers/admin/mothers.py:62-204`），需要拆分依赖并传递 Pool 会话。
  - 统计路由 `GET /api/admin/stats` 在 Users 会话内统计 Pool 数据（`cloud/backend/app/routers/routers/stats.py:10-72`），拆分后应切换到 Pool 会话或引入聚合服务。
  - 批量任务路由 `jobs` 已拆分为 `admin_jobs` 服务输出 DTO（`cloud/backend/app/services/services/admin_jobs.py`），路由层仅负责权限校验与响应组装；后续仍需扩展池侧查询。
- **后台任务**：
  - `process_one_job` / `JobRunner` 已支持注入 `pool_session_factory`，后台维护循环调用时传入 `SessionPool`，测试环境复用 Users 会话；后续需将母号服务完全迁移到 Pool 仓储。
- **仓储现状**：`MotherRepository`、`PoolRepository` 已提供分页/查询接口（`cloud/backend/app/repositories/mother_repository.py:22-106`, `cloud/backend/app/repositories/pool_repository.py:29-134`），但 `admin` 服务仍未使用，后续重构可直接复用。
- **ChildAccountService 接入缺口**：虽然已提供 `create_child_account_service` 工厂（`cloud/backend/app/services/services/child_account.py:320`），目前未在路由或任务中注入，阶段二需明确调用方并接入监控。
- **依赖注入工具**：`get_db` 默认返回 Users 会话（`cloud/backend/app/database.py:69-91`），后续需要在路由层改用 `get_db_users`/`get_db_pool` 组合，或封装新的依赖提供对象化服务。

## 行动步骤
1. 先实现 `MaintenanceService` 重构，保证定时任务双库可用。
2. 基于《阶段二领域模型与路由拆分设计》（`docs/refactor/phase2_design.md`）推进母号领域重构与服务拆分。
3. 衔接 ChildAccount 接入与批处理改造，更新 TODO 与发布计划。
