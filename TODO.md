# TODO

## 双库彻底分离改造路线

### 阶段一：准备与评估
- [x] 梳理 Users ↔ Pool 跨库调用清单，标注文件、函数与调用链。
- [x] 导出现有数据库结构与数据量级，设计迁移窗口与校验策略。
- [x] 制定回滚与监控方案，更新拆分目标及验收标准文档。
- [x] 列出 remaining 服务（如 `maintenance`, `child_account`, `admin`）的跨库调用点并排序优先级。

### 阶段二：后端重构（服务与仓储）
- [x] 搭建 Users / Pool 各自的仓储层与依赖注入，移除直接跨库访问。
- [x] Maintenance 服务仓储化改造（`create_maintenance_service`）。
- [x] 建立 `ChildAccountService` + 日志化，等待路由接入。
- [ ] 拆分领域模型：重构 `MotherAccount` 等实体与关联关系（规划中）。
- [ ] 拆分 API 路由，确保用户组与号池接口分别使用对应数据库会话。
- [x] 重写批处理任务队列，让 Users 与 Pool 独立运转（JobRunner + admin_jobs 服务）。
 - [x] 接入新 `ChildAccountService`（替换历史调用）并补齐监控与测试。
 - [x] 重构 `create_mother` / `list_mothers_with_usage` 等母号相关服务，拆分 Users/Pool 仓储。

### 阶段三：数据迁移与基础设施
- [ ] 编写迁移脚本与校验脚本，实现 Pool 数据迁出与字段补齐。
- [ ] 调整部署配置、CI 流水线，区分两套数据库连接与 Alembic 迁移。
- [ ] 扩展监控与告警，覆盖新服务的关键指标。

### 阶段四：前端重构
- [ ] 拆分管理后台路由、状态与 API 封装，构建用户组/号池独立视图。
- [ ] 重写导入、录入与批量操作表单，使其仅依赖单一后端入口。
- [ ] 更新 UI/UX 流程与权限文案，防止跨域误操作。

### 阶段五：测试与发布
- [ ] 补充单元、集成、端到端测试矩阵，覆盖双库场景。
- [ ] 搭建镜像或回放环境，验证大规模导入与兑换流程。
- [ ] 制定灰度上线计划并执行，监控后清理旧代码与文档。

---

## M1 必做（零数据库迁移，快速收敛）

- 后端｜入队去重优化（pool_sync_mother）
  - [x] 在 `cloud/backend/app/services/services/pool_group.py:enqueue_pool_group_sync` 增加短时分布式锁（如基于 Redis 的 `pool_sync:{mother}:{group}`，过期 30–60s；Redis 不可用则退化为仅 SQL 预筛）。
  - [x] SQL 预筛：`WHERE job_type='pool_sync_mother' AND status IN ('pending','running') AND payload_json LIKE '%"mother_id":{mid}%' AND payload_json LIKE '%"group_id":{gid}%'`，再做 JSON 校验。
  - [ ] 压测验收：并发入队 100 次，仅生成 1 个有效 Job；其余复用已存在 Job。
    - 脚本：`python cloud/backend/scripts/pressure_test_pool_enqueue.py --attempts 100`（默认会创建临时 Mother/Group）

- 后端｜域头强校验（X-Domain）
  - [x] 新增依赖 `require_domain('pool'|'users')`（读取 `X-Domain`）。
  - [x] 在 Pool 路由（`/mothers*`, `/pool-groups*`）与 Users 路由部分（`/users*`, `/codes*` 部分、`/jobs*`）接入校验；只读接口暂不强制。

- 后端｜JobRunner 幂等单测
  - [x] 覆盖：重复重命名不改变状态；成员回填不重复；自动邀请仅一次（见 `tests/test_jobrunner_idempotency.py`、`tests/test_pool_sync_idempotent.py`）。

- 前端｜CSRF 失败与权限统一处理
  - [x] `cloud/web/lib/api/admin-client.ts`：拉取 CSRF 失败时直接返回统一错误；后端 401/403 → 统一错误消息。

- 前端｜“一键同步”反馈
  - [x] `pool-groups/page.tsx`：成功后 toast 显示入队数量 + 0.5s 跳转 “任务列表”。

## M2 改善（可观测与稳定性）

- 后端｜管理端 API 指标
  - [x] 在 `cloud/backend/app/middleware/security.py` 增加计数器 `admin_api_requests_total{path,method,domain,status}`（定义于 `app/metrics_prom.py`）。

- 前端｜域分离静态检查
  - [x] CI 脚本：`cloud/web/scripts/check-domain-imports.cjs`；新增 npm 脚本 `ci:domain-check`。

- 前端｜Users Store 迁移（分页/筛选）
  - [x] 将 `use-users-view-model`、`use-codes-view-model` 中的分页/筛选状态迁至 `cloud/web/store/users/*`；新增 `SearchFiltersUsers` 并在用户/兑换码页启用。

- 文档｜域策略与头部规范
  - [x] 更新 `cloud/docs/POOL-GROUPS.md` 与《ChatGPT_API代理请求文档.md》，补充 `X-Domain` 校验、错误码与幂等策略；新增 `/api/admin/system` 文档。

## M3 打磨（性能与体验）

- 后端｜入队速率与租约可配置
  - [x] 在文档和 `/api/admin/system` 暴露 `job_visibility_timeout_seconds`/`job_max_attempts`，说明调整策略与影响。
  - [x] 新增 `/api/admin/system` 返回 `env` 与 `jobs.visibility_timeout_seconds/max_attempts` 等只读参数。

- 前端｜Toast 与导航统一
  - [x] 抽象 `useSuccessFlow`：统一“toast + 可选跳转 + 自动关闭”的成功交互（已在号池组页、生成兑换码接入）。
  - [x] 扩展接入：Users 异步批处理提交、导入弹窗（池化模式）成功跳转。
    - Users：异步提交成功后跳转 Jobs（`cloud/web/components/admin/views/users/use-users-view-model.ts`）。
    - Pool 导入：一键录入成功后跳转 Jobs（`cloud/web/components/admin/auto-import-dialog.tsx`）。

- CI｜迁移校验与双库校验
  - [x] 在 CI 中执行 `cloud/backend/scripts/verify_dual_migrations.py` 与 API smoke（`/metrics`, `/api/admin/db-status`, `/api/admin/system`）。
    - 工作流：`.github/workflows/backend-ci.yml`（双 SQLite Schema 初始化 + Uvicorn Smoke）。
  - [x] 将 `pnpm --filter cloud/web run ci:domain-check` 接入前端 CI pipeline（`.github/workflows/web-ci.yml`）。
