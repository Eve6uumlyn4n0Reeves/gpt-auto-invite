## 双服务验收测试清单

### 1. Users 服务

| 场景 | 步骤 | 期望 |
| --- | --- | --- |
| 健康检查 | `curl http://localhost:8001/health` | `{"ok": true}` |
| 管理登录 | 前端 `USERS_BACKEND_URL` 指向服务；登录后台 | 登录成功，设置 `X-Domain: users` |
| 兑换码生成 | 调用 `/api/admin/codes` | 返回批次信息，数据库写入 `users.db` |
| 批量操作 | `/api/admin/batch/codes` disable | 选中码被禁用 |
| 队列与任务 | `/api/admin/jobs` | 能看到任务列表 |
| 公共 API | `/api/redeem` + `/api/switch` | 返回业务结果（注意目前仍依赖 Pool 数据） |

### 2. Pool 服务

| 场景 | 步骤 | 期望 |
| --- | --- | --- |
| 健康检查 | `curl http://localhost:8002/health` | `{"ok": true}` |
| 号池管理 | `/api/admin/pool-groups` CRUD | 正常创建/更新，写入 `pool.db` |
| 母号管理 | `/api/admin/mother-groups`, `/api/admin/mothers` | 列表与编辑可用 |
| 自动录入 | `/api/admin/auto-ingest` | 返回 Job/状态 |
| Pool API | `/pool/teams/:workspace_id` endpoints | 需 `X-API-Key`，返回远端调用结果 |
| Ingest 公共 API | `/api/mother-ingest` | HMAC 校验通过 |

### 3. 前端联调

1. 设置：
   ```bash
   export USERS_BACKEND_URL=http://localhost:8001
   export POOL_BACKEND_URL=http://localhost:8002
   pnpm dev
   ```
2. 在浏览器验证：
   - 管理后台 → 兑换码（Users）
   - 管理后台 → 号池组（Pool）
   - 公共 `/redeem` 页面

### 4. 数据一致性脚本

运行现有脚本确认新库数据：

```bash
cd src/backend/scripts
python verify_dual_migrations.py --users-db ../data/users.db --pool-db ../data/pool.db
python test_separated_dbs.py
```

### 5. 监控与日志

- Users 服务：关注 `batch_jobs_processed_total`、`redeem_*` 指标。
- Pool 服务：关注 `pool_sync_actions_total`、`pool_api_*` 指标。
- 两个服务都应输出 `health` 检查日志并在异常时报警。

