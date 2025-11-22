## 双数据库物理迁移方案

目标：让 Users 服务与 Pool 服务各自连接独立的数据库实例，并保证迁移过程中数据一致、可回滚。

### 1. 准备阶段

1. **拆分配置**：
   - 为两个服务分别准备环境变量：`DATABASE_URL_USERS`、`DATABASE_URL_POOL`。
   - 确保 `users_app` 与 `pool_app` 的启动脚本只注入对应的连接串。
   - 在完成解耦后，线上环境应开启 `STRICT_DOMAIN_GUARD=true`，防止服务误访问对方数据库。
2. **备份**：
   - 使用 `scripts/export_db_snapshot.py` 或 `sqlite3 .dump` 导出当前 `app.db`（包含 Users/Pool 双表）。
   - 将导出的快照上传至安全存储，以便回滚。

### 2. 初始化新实例

1. 在目标数据库（PostgreSQL 或独立 SQLite 文件）中分别创建空数据库：
   - `gpt_invite_users`
   - `gpt_invite_pool`
2. 执行迁移（也可以直接运行 `scripts/migrate-users.sh` / `scripts/migrate-pool.sh`）：
   ```bash
   # Users 域
   alembic -c alembic_users.ini upgrade head

   # Pool 域
   alembic -c alembic_pool.ini upgrade head
   ```
3. 若在开发环境，可使用 `python -m app.database` 的 `create_all` 逻辑进行快速自检，但生产必须依赖 Alembic。

### 3. 数据切割与导入

1. **导出旧数据**
   - 使用 `scripts/separate_databases.py`（已有脚本）或自定义 SQL，将 Users 相关表（`redeem_codes`, `invite_requests`, `admin_*`, `batch_jobs`, `switch_requests`, `bulk_operation_logs` 等）导出为 JSON/CSV。
   - 同理导出 Pool 相关表（`mother_accounts`, `mother_teams`, `seat_allocations`, `pool_groups`, `child_accounts`, `mother_groups` 等）。
2. **导入新库**
   - 将 Users 导出数据导入 `gpt_invite_users`。
   - 将 Pool 导出数据导入 `gpt_invite_pool`。
   - 脚本推荐顺序：先导入主表再导入引用表（如先 `mother_accounts` 后 `mother_teams`）。
3. **验证**
   - 对比导入前后的行数/校验和。
   - 随机抽样关键记录（兑换码、母号、Pool 组）确认数据字段一致。
   - 运行 `python scripts/check_domain_isolation.py --root src/backend/app`，确认代码层面没有新增跨域依赖。

### 4. 切换流程

1. **配置更新**：
   - Users 服务环境仅注入 `DATABASE_URL_USERS`（`DATABASE_URL_POOL` 可留空）。
   - Pool 服务环境仅注入 `DATABASE_URL_POOL`。
2. **灰度**：
   - 先在 staging 环境启动 `users_app`、`pool_app`，执行冒烟测试。
   - 若通过，再在生产部署两个服务并在负载均衡层拆分路由（前端的 Users 页面指向 Users API，Pool 页面指向 Pool API）。
   - 灰度完成前请保持 `STRICT_DOMAIN_GUARD=true`，如需调试可临时关闭，但要记录原因与回滚步骤。
3. **回滚策略**：
   - 需要切换回单体时，可暂时让 Monolith 继续使用两个独立数据库（`app.main` 支持新的连接串）。
   - 保留迁移前的快照，在严重问题时可恢复旧库并切换 DNS。

### 5. 迁移后检查项

- 监控：
  - 分别为两个数据库/服务配置连接数、慢查询、错误率告警。
- 数据一致性：
  - 由于服务彻底隔离，不再存在跨库写；保留脚本 `scripts/verify_mother_groups_consistency.py` 仅用于历史数据。
  - Monolith 仅用于回滚，应在 `STRICT_DOMAIN_GUARD=false` 时短期使用，问题解决后立即恢复双服务架构。
- 文档：
  - 更新 README/部署手册，说明新的启动命令与环境变量要求。

