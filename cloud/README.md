# Cloud 模块（后端 + 管理台）

本模块提供母号与团队邀请的后端服务（FastAPI）与管理后台（Next.js）。已对齐你的业务规则，并补齐批量导入/导出与可视化看板。

## 功能概览
- 母号与席位管理：每个母号固定 7 个席位；按“先填满一个母号再换”且优先“早录入”的母号；同一邮箱可加入多个团队（仅限制同一 team 不重复）。
- 兑换码恒等：可兑换额度 = 活跃且“有启用团队”的空位 − 未过期未使用码；生成时严格校验，统计口径与前端一致。
- 兑换码管理：生成、复制、TXT 导出；“码状态总览”展示 码-邮箱-母号-团队 映射与使用时间。
- 批量导入：支持 JSON/JSONL 文件与“纯文本粘贴”（邮箱---accessToken）；导入前可在界面修改 team 名称/默认/启用并校验。
- 批量操作：批量禁用未使用码、批量重发/取消邀请、批量移除成员（谨慎使用）。
  - 新增：支持“异步批量”队列（可在后台提交任务并查询状态），接口：`POST /api/admin/batch/users/async`、`GET /api/admin/jobs{,/id}`。

## 目录结构
- backend：FastAPI 服务（`cloud/backend/app`），SQLite/PostgreSQL 兼容。
- web：Next.js 管理后台（`cloud/web`）。
- scripts：开发/部署脚本。

## 运行与部署
- 开发
  - 后端：`uvicorn app.main:app --reload --port 8000`
  - 前端：在 `cloud/web` 运行 `pnpm install && pnpm dev`（或使用 `scripts/start-dev.sh`）
  - 前端需设置 `BACKEND_URL`（默认 `http://localhost:8000`）。
- 生产
  - `docker-compose up -d`（参见 `cloud/docker-compose.yml`）。

## 管理后台（使用说明）
- 登录：首次密码取环境变量 `ADMIN_INITIAL_PASSWORD`（默认 `admin123`，生产必须修改）。
- 母号看板：展示每个母号的座位使用率与启用团队列表。
- 码状态总览：展示兑换码与邮箱/母号/团队映射与使用时间，支持状态/母号/团队/批次筛选和搜索。
- 兑换码：生成后可“一键复制全部”或“下载 TXT”。
- 批量导入（推荐）
  - 粘贴文本：在“批量导入”页粘贴，每行 `邮箱---accessToken`（也兼容空格分隔），点击“解析到列表”。
  - 上传文件：上传 JSON/JSONL/TXT；JSONL/NDJSON 每行一个对象（兼容 `local-gui` 导出的结构化格式）。
  - 编辑与校验：可逐条修改 team 名称/默认/启用，点击“校验”整理重复与默认唯一性后“导入”。

## 业务规则（关键点）
- 座位分配优先级：按母号 `created_at` 升序遍历，有空位即分配；同母号内按 `slot_index` 从小到大使用。
- 邮箱复用：允许同一邮箱加入不同 team，唯一约束为 `(team_id, email)`。
- 兑换码与位置恒等：生成前强制校验“空位 − 可用码”余额；统计展示相同口径。
- Token 到期：若上游未提供过期时间，后端回退为当前时间 + 40 天；遇到上游 401/403 自动将母号置为 invalid 并切换下一母号（前端不强调到期，仅内部容错）。

## 核心接口（Admin）
- 登录/会话
  - `POST /api/admin/login`，`GET /api/admin/me`，`POST /api/admin/logout`
- 母号
  - `POST /api/admin/mothers`：新增母号（name、access_token、token_expires_at、teams、notes）。
  - `GET /api/admin/mothers`：列表（含 seats_used）。
  - `PUT /api/admin/mothers/{id}`、`DELETE /api/admin/mothers/{id}`。
- 批量导入母号
  - `POST /api/admin/mothers/batch/validate`：对结构化数组逐条校验/规范（仅返回校验信息，不落库）。
  - `POST /api/admin/mothers/batch/import`：导入结构化数组（JSON/JSONL）。
  - `POST /api/admin/mothers/batch/import-text`：导入纯文本，`Content-Type: text/plain; charset=utf-8`；每行 `邮箱---accessToken`（可传 `?delim=...` 指定分隔符）。
- 兑换码
  - `POST /api/admin/codes`：生成兑换码；返回 `batch_id` 与码列表；配额=空位（活跃且有启用团队）− 未过期未使用码。
  - `GET /api/admin/codes`：兑换码明细（含邮箱/母号/团队映射、使用时间）。
  - `GET /api/admin/export/codes?format=txt|csv&status=all|unused|used`：导出（CSV 不包含过期字段，TXT 仅码值）。
  - `POST /api/admin/codes/{code_id}/disable`：禁用未使用码（设置过期为当前）。
- 用户/邀请
  - `GET /api/admin/users`：邀请记录（含 team 与使用码）。
  - `POST /api/admin/resend|cancel-invite|remove-member`：重发/取消/移除。
  - `POST /api/admin/batch/users`：批量重发/取消/移除。

## 并发与一致性
- 兑换码防并发：`unused -> blocked -> used`（CAS/行级锁），失败回滚为 `unused`。
- 座位占用：先 `held`（默认 30 秒）再 `used`，后台定期清理过期 `held`。
 - 邀请接受回填：后台定期同步团队成员，将已加入的用户标记为 `accepted` 并回填 `member_id`。

## 常见问题
- 生成兑换码报“数量超出配额”：检查活跃且有启用团队的空位与可用码余额。
- 母号 401/403：自动标记为 invalid 并跳过；在后台更新新 token 可恢复。

> 备注：不对用户强调“到期/即将到期”，仅后端内部容错与校验。
