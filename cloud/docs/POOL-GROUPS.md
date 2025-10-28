# 号池组（Pool Groups）配置与使用指南

## 环境变量

- `CHILD_EMAIL_DOMAIN`: 号池组子号邮箱域名（例如 `aifun.edu.kg`）。不写死，建议通过环境注入。
- `POOL_AUTO_INVITE_MISSING`: 自动邀请补齐空位（`true`/`false`，默认 `false`）。开启时将按模板生成邮箱并发送邀请。

## 模型

- `PoolGroup`：号池组。
- `PoolGroupSettings`：组级命名/域名配置。
- `GroupDailySequence`：组+日期的序列计数，支持 `team` 与 `child` 两类。
- `MotherAccount.pool_group_id`：母号所属号池组（可空）。
- `ChildAccount.member_id` 与唯一约束 `UNIQUE(mother_id, team_id, email)` 确保“一子号一team”。

## 命名规则

- 默认模板：`{group}-{date}-{seq3}`，其中 `{seq3}` 为三位序号（零填充）。
- 团队与子号可使用不同模板；邮箱模板示例：`{group}-{date}-{seq3}@{domain}`。
- 允许占位符集合：`{group}`、`{date}`、`{seq3}`、`{domain}`；出现其他占位符将被拒绝（400）。

## 后端接口

- 创建组：`POST /api/admin/pool-groups` { name, description? }
- 列表：`GET /api/admin/pool-groups`
- 更新设置：`POST /api/admin/pool-groups/{group_id}/settings` { team_template?, child_name_template?, child_email_template?, email_domain?, is_active? }
- 预览名称：`GET /api/admin/pool-groups/{group_id}/preview`
- 手动触发同步：`POST /api/admin/pool-groups/{group_id}/sync/mother/{mother_id}` → 返回 `job_id`
- 组内全部入队：`POST /api/admin/pool-groups/{group_id}/sync/all` → 返回 `{ count, job_ids }`
- 导入并入队（号池模式）：`POST /api/admin/import-cookie` { cookie, mode:"pool", pool_group_id }
- 队列查询：`GET /api/admin/jobs?status=pending`、`GET /api/admin/jobs/{job_id}`、`POST /api/admin/jobs/{job_id}/retry`（由 JobRunner 执行）

## 同步流程（异步）

1. 重命名母号下所有可用团队（模板 + 组 + 日期 + 三位序号）。
2. 同步现有成员到本地 `ChildAccount`（跳过母号本人）。
3. 若开启自动邀请，则按邮箱模板补齐空位（可选）。
4. JobRunner 通过双库（Users + Pool）会话执行任务，失败可在 `/api/admin/jobs` 重试。

## 指标

- `pool_sync_actions_total{action=rename_team|sync_child|auto_invite}`
- `pool_sync_duration_ms`（一次同步整体耗时）

## 前端

- 导入弹窗：支持用户/号池模式切换，号池模式会返回 `job_id` 并可轮询状态。
- 号池组管理页：创建组、设置模板与域名、预览命名。

## 注意事项

- 域名不可写死，务必通过 `CHILD_EMAIL_DOMAIN` 或每组设置 `email_domain` 配置。
- 若使用 Postgres，Alembic 迁移已兼容 enum 扩展；SQLite 环境同样可用。
- 所有 `POST` 接口均要求 CSRF 验证（`require_csrf_token`）。
- 生产环境要求前端请求头携带 `X-Domain: pool`，后端将强制校验；响应头回显 `X-Domain-Ack` 便于审计。

## 业务分离与去重

- 会话归属：
  - 号池数据（`MotherAccount`/`PoolGroup*`/`ChildAccount` 等）只允许使用 Pool 会话（`get_db_pool()`）读写。
  - 任务实体 `BatchJob` 只允许使用 Users 会话（`get_db_users()`）读写。
- 入队接口：`enqueue_pool_group_sync(pool_session, users_session, mother_id, group_id)` 会：
  1) 在 Pool 会话中写入 `mother.pool_group_id`；
  2) 在 Users 会话中创建 `BatchJob(type=pool_sync_mother, payload={mother_id, group_id})`；
  3) 应用层去重：若存在相同 `(mother_id, group_id)` 的 `pending/running` 任务则直接返回该任务。
