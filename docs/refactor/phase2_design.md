# 阶段二领域模型与路由拆分设计（草案）

更新时间：2025-10-27

## 目标

1. 将母号（Mother）及其子资源（Team / Seat / ChildAccount）彻底迁移至 Pool 仓储，Users 仓储仅保留邀请、兑换等用户链路数据。
2. 为管理端 API 提供双会话依赖（Users / Pool），避免跨库 SQL。
3. 重构批处理与后台任务，使其显式注入池会话并复用统一服务。
4. 为后续接入 `ChildAccountService` 与监控指标铺平道路。

## 新的领域划分

### 1. 数据实体（Pool 库）

| 实体 | 作用 | 备注 |
| --- | --- | --- |
| `MotherAccount` | 母号主体 | 仅在 Pool 仓储读写 |
| `MotherTeam` | 团队/群组 | 仅在 Pool 仓储读写 |
| `SeatAllocation` | 席位分配 | 仅在 Pool 仓储读写 |
| `PoolGroup` / `PoolGroupSettings` | 号池组配置 | 仅 Pool |
| `ChildAccount` | 子号 | 仅 Pool |

Users 库保留 `InviteRequest`、`RedeemCode`、`BatchJob` 等用户侧实体。

### 2. 借助 DTO/领域对象解耦

新增 `cloud/backend/app/domains/mother.py`（建议）：

```python
@dataclass
class MotherSummary:
    id: int
    name: str
    status: MotherStatus
    seat_limit: int
    group_id: int | None
    teams: list[MotherTeamSummary]
    seats_in_use: int

@dataclass
class MotherTeamSummary:
    team_id: str
    team_name: str | None
    is_enabled: bool
    is_default: bool
```

这些对象由 Pool 仓储构建，供 Users 侧 API 返回，避免暴露 ORM 模型。

## 仓储与服务调整

### Pool 仓储

- 扩展 `MotherRepository`（`cloud/backend/app/repositories/mother_repository.py`）：
  - `create_mother(payload: MotherCreatePayload) -> MotherAccount`
  - `list_with_usage(page, page_size, search) -> tuple[list[MotherSummary], PaginationMeta]`
  - `attach_teams_and_seats(mothers: list[MotherAccount]) -> list[MotherSummary]`
- 将 `PoolRepository` 中分页逻辑合并或以组合方式调用，保持单一职责。

### Users 仓储

- 补充 `InviteRepository`（可基于 `UsersRepository` 拆分，或在现有类中以方法分组）：
  - `list_invites_for_email`, `mark_invite_status` 等保留.
  - 关键是避免在 Users 仓储中访问 Pool 模型。

### 服务层

1. `MotherCommandService`（新建）  
   - 负责创建/更新/删除母号。  
   - 接收 `pool_session`、`MotherRepository`、`TeamNamingService` 等依赖。  
   - `create` 方法返回 `MotherSummary`，内部仅触碰 Pool 数据。  
   - 需要将现有 `create_mother` 函数迁移至该服务，移除 Users 会话参数。

2. `MotherQueryService`（新建）  
   - 处理分页列表、统计等读操作。  
   - 提供 `list_mothers_with_usage`、`get_quota_metrics` 等方法，输出 DTO。  
   - 为统计路由 `GET /api/admin/stats` 提供 Pool 数据，Users 侧统计（验证码/邀请）继续复用 Users 会话。

3. `InviteFacade`（改造现有 `InviteService`）  
   - Users 会话：管理邀请与兑换码。  
  - Pool 会话：通过 `MotherRepository` 查询可用母号。  
   - 引入组合服务以获取 `MotherSummary` 避免直接操作 ORM 模型。

4. `BatchJobService` / `JobRunner`（已完成第一阶段重构）  
   - ✅ `JobRunner` 支持显式注入 Users Session 与 Pool Session 工厂（`process_one_job` 为薄封装）。  
   - ✅ `/api/admin/jobs` 由 `admin_jobs` 服务输出 DTO，路由层仅做权限校验与错误映射。  
   - ⏱️ 后续补充取消/筛选等接口，并将母号命令服务迁移到 Pool 仓储后复用。

## 路由拆分方案

### 依赖注入

- 在 `cloud/backend/app/routers/admin/dependencies.py` 中新增：

```python
def get_services(
    users_db: Session = Depends(get_db_users),
    pool_db: Session = Depends(get_db_pool),
) -> ServicesBundle:
    ...
```

`ServicesBundle` 聚合 `MotherCommandService`、`MotherQueryService`、`InviteFacade` 等，方便路由层使用。

### 管理端母号路由

- `POST /api/admin/mothers`：接受 `ServicesBundle`，调用 `MotherCommandService.create`。  
- `GET /api/admin/mothers`：调用 `MotherQueryService.list_mothers_with_usage`，返回 DTO。  
- 批量导入/验证：在 Users 会话中解析输入后，将业务操作委托给 `MotherCommandService`。

### 统计路由

- 拆分查询：Users 数据（Invite/Redeem）使用原 `db_users`，Pool 数据调用 `MotherQueryService`。  
- 可在响应中合并两个来源的数据或前端分两次请求。

### 批处理路由

- `enqueue_users_job` 保持 Users 会话。  
- `JobRunner` 已通过 `pool_session_factory` 使用显式的 Pool 会话；下一步将母号命令服务注入，移除遗留的 ORM 直写。  
- `/api/admin/jobs` 使用 `admin_jobs` 服务生成响应，后续在此基础上扩展取消/筛选能力。

## ChildAccountService 接入思路

- 在 `MotherCommandService` 中增加 `attach_child_service`（可选），当母号创建或同步后，调度 `ChildAccountService` 拉号。  
- 对外暴露事件或回调接口，便于后续扩展队列处理。  
- 增加 Prometheus 指标：成功/失败次数、执行耗时。

## 改造步骤（建议顺序）

1. **引入 DTO 与服务骨架**  
   - 创建 `domains/mother.py` 与新的 `MotherCommandService`/`MotherQueryService` 空实现。  
   - 增加单元测试验证 DTO 序列化。

2. **迁移创建逻辑**  
   - 重构 `create_mother` 路由与服务，确保仅使用 Pool 会话。  
   - 更新相关测试（`cloud/backend/tests/test_app.py::test_create_mother_creates_seats`）。

3. **迁移列表/统计查询**  
   - 使用 `MotherQueryService` 重写 `list_mothers_with_usage`、`/stats`。  
   - 前端 API 不变，后端返回 DTO。

4. **重写批处理与后台任务**（✅ JobRunner 已初步落地）  
   - 后续任务：引入 `MotherCommandService`/`MotherQueryService` 后，与 `JobRunner` 结合确保所有 Pool 写操作通过仓储完成。  
   - 保持覆盖测试（`test_jobs_and_sync.py`、`test_pool_and_import.py`）并扩展端到端用例。

5. **接入 ChildAccountService + 监控**  
   - 将母号创建/同步后续步骤抽象为 `MotherLifecycle` 事件。  
   - 添加指标与日志。

6. **清理遗留函数**  
   - 删除旧的 `create_mother` 函数与直接操作 ORM 的代码。  
   - 更新文档与 TODO 状态。

## 兼容性与迁移注意事项

- 在完成新服务之前保留旧实现，采用 feature flag（环境变量）或路由参数保护，逐步切换。  
- 测试矩阵需覆盖：母号创建、团队变更、批量导入、批处理任务、ChildAccount 同步。  
- 生产发布前需再次运行双库快照与 `verify_dual_migrations.py`，确保无跨库访问回归。

## 后续文档更新

- 更新 `docs/refactor/phase2_plan.md` 的“行动步骤”与进度表。  
- 在阶段三执行时补充 CI/迁移脚本与监控配置说明。
