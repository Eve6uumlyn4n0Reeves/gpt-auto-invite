# 双库改造阶段一交付（2025-10-27）

本文件记录双库拆分路线阶段一的产出，涵盖数据基线、迁移窗口、校验、回滚与监控方案，并给出后续阶段的验收标准。

## 1. 数据基线（导出于 2025-10-27）

- 快照脚本：`python3 cloud/backend/scripts/export_db_snapshot.py --output cloud/docs/snapshots/2025-10-27-db-snapshot.json`
- 最新导出文件：`cloud/docs/snapshots/2025-10-27-db-snapshot.json`

### Users 库（当前指向开发 SQLite）

| 表名 | 行数 |
| --- | ---: |
| admin_config | 1 |
| admin_sessions | 10 |
| audit_logs | 12 |
| batch_jobs | 0 |
| bulk_operation_logs | 0 |
| redeem_codes | 2 |
| invite_requests | 0 |

- 发现：`unexpected_tables` 包含 Pool 相关表（`mother_accounts` 等），原因是开发环境仍共用同一 SQLite 文件；生产迁移前需确保 Users/Pool 指向独立实例。

### Pool 库（当前指向开发 SQLite）

| 表名 | 行数 |
| --- | ---: |
| mother_groups | 0 |
| pool_groups | 0 |
| group_daily_sequences | 0 |
| mother_accounts | 3 |
| pool_group_settings | 0 |
| child_accounts | 0 |
| mother_teams | 0 |
| seats | 0 |

- 发现：`unexpected_tables` 中包含 Users 库表（如 `redeem_codes`），同样需要在生产环境拆分物理库。
- 快照脚本已兼容 PostgreSQL，可自动采集 `pg_total_relation_size`；切换生产配置后重新执行即可得到准确数据量级。

## 2. 迁移窗口建议

1. **T-7 天**：冻结新增跨库依赖（PR 审查要求引用 Repository 接口），完成双库配置在预发布环境的部署验证。  
2. **T-3 天**：触发一次完整 `export_db_snapshot.py` 与 `scripts/verify_dual_migrations.py`，记录 Users/Pool 行数基线，并确认 Alembic 版本一致。  
3. **T-1 天**：暂停批量导入与队列任务（`process_one_job`），并开启只读维护窗口公告；准备 `pg_dump`/`pg_basebackup` 完整备份。  
4. **迁移日 (T)**：  
   - 执行新迁移脚本（见阶段三任务），逐库校验检查点。  
   - 切换应用环境变量：仅当 Users/Pool 两库都就绪才重新放量。  
5. **T+1 天**：对账日志、审计表与 Prometheus 指标，观察峰值负载。

窗口长度建议 1 小时内，可通过预热新库和压测降低风险；若数据量超出预计，需在 T-3 天重新评估。

## 3. 校验策略

| 时段 | 校验动作 | 目的 |
| --- | --- | --- |
| 迁移前 | `python3 cloud/backend/scripts/export_db_snapshot.py` | 记录行数基线 |
| 迁移前 | `python3 cloud/backend/scripts/verify_dual_migrations.py` | 确认表未跨界 |
| 迁移前 | `alembic current`（双库） | 确认版本一致 |
| 迁移后 | 再次执行快照脚本并对比 JSON | 验证行数/表结构一致 |
| 迁移后 | `GET /api/admin/db-status` | 检查连接与 Alembic 版本 |
| 迁移后 | `GET /metrics` 中 `maintenance_lock_*`、`provider_calls_total` | 确认后台任务正常 |

建议在 CI 中加入快照脚本的 dry-run（`--output /tmp/...`）与 verify 脚本，避免回归。

## 4. 回滚方案

1. **预备**：迁移前完成双库物理备份（`pg_dump --format=custom`），同时保留旧 `DATABASE_URL` 供快速回退。  
2. **开关**：通过环境变量切换，回滚时统一指向旧实例（或单库 URL），并重启应用。  
3. **数据回滚**：若迁移后出现写入异常，使用备份恢复 Users/Pool 各自库；若仅有部分表受影响，可利用 `export_db_snapshot.py` 找出差异表并做增量恢复。  
4. **验证**：回滚后再次运行 verify 与快照脚本，确保表界限恢复，随后解除维护状态。

## 5. 监控与告警

- **数据库**：`/api/admin/db-status` 周期拉取，校验连接健康与 Alembic 版本；结合基础设施层监控（RDS、Cloud SQL 等）设置 CPU / 连接池告警。  
- **后台任务**：Prometheus 指标 `maintenance_lock_acquired_total`、`maintenance_lock_miss_total`；若错失次数持续增加则提示锁竞争或数据库不可用。  
- **限流/前端**：前端 `PerformanceMonitor` 与后端 `provider_latency_ms` 结合，迁移后关注 95/99 分位延迟。  
- **日志**：关注 `MaintenanceService`、`ChildAccountService` 与 `InviteService` error 级别日志，确保无跨库访问回退。

## 6. 验收标准（阶段一）

1. `export_db_snapshot.py` 在预发布环境输出的 JSON 行数与预期一致，并归档到 `cloud/docs/snapshots/`。  
2. `verify_dual_migrations.py` 在双库环境下通过（无 `unexpected_tables`）。  
3. 迁移窗口与回滚步骤在 Runbook 中固化，团队成员已过演练。  
4. 监控与告警接入项完成配置（至少达成 DB 健康 + Prometheus 指标上报）。

满足以上条件后，可将 TODO 阶段一条目勾选并进入阶段二改造。

## 7. 下一步

- 根据本计划执行阶段二剩余事项（领域模型拆分、批处理重构、ChildAccountService 接入）。  
- 在阶段三编写正式迁移脚本时复用快照与校验步骤，确保后续发布路径可重复。
