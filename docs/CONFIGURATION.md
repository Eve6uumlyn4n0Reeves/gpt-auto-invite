# 配置教程（开发/生产）

本教程汇总并统一 cloud 后端/前端的环境变量配置，给出开发与生产的完整示例和注意事项。

## 快速索引
- 开发环境：最少变量，SQLite + 本地代理
- 生产环境：PostgreSQL + Redis + Nginx 反代 + 严格安全配置
- 生成密钥与常见问题

---

## 一、环境变量清单

后端读取于 `cloud/backend/app/config.py`。关键变量：

- 核心（必须，生产环境）
  - `ADMIN_INITIAL_PASSWORD` 管理员初始密码
  - `SECRET_KEY` 会话签名密钥（itsdangerous）。必须强随机
  - `ENCRYPTION_KEY` 32 字节 base64（AES-256-GCM 用于加密 access_token）
  - `ENV` 或 `APP_ENV`：`dev` / `production`（生产时触发严格校验）
  - `DOMAIN` 生产域名（用于 Cookie/Security Headers）
- 数据库
  - `DATABASE_URL` 开发缺省 SQLite；未设置时默认使用绝对路径 `cloud/backend/data/app.db`（避免工作目录差异）。生产建议 Postgres，如：`postgresql+psycopg2://user:pass@postgres:5432/invite_db`
- 限流/Redis（推荐生产启用）
  - `RATE_LIMIT_ENABLED` 默认 `true`
  - `REDIS_URL`（或 `REDIS_HOST/REDIS_PORT/REDIS_DB/REDIS_PASSWORD`）
  - `RATE_LIMIT_NAMESPACE` 默认 `gpt_invite:rate`
  - 说明：前端内存限流仅作用户体验提示，最终限流以后端（Redis/内存回退）为准
- 策略与安全
  - `ADMIN_SESSION_TTL_SECONDS` 管理会话 TTL（秒），默认 7 天
  - `TOKEN_DEFAULT_TTL_DAYS` Token 回退有效天数（默认 40）
  - `SEAT_HOLD_TTL_SECONDS` 座位占位（held）时长，默认 30 秒
  - `MAINTENANCE_INTERVAL_SECONDS` 维护循环执行间隔（默认 60 秒）
  - `INVITE_SYNC_DAYS` 邀请接受回填扫描的时间窗口（默认 30 天）
- `INVITE_SYNC_GROUP_LIMIT` 回填时每轮处理的（mother_id, team_id）组上限（默认 20）
  - `JOB_VISIBILITY_TIMEOUT_SECONDS` 异步任务可见性超时（默认 300 秒），超时未完成将重新入队
  - `JOB_MAX_ATTEMPTS` 异步任务最大尝试次数（默认 3 次）
  - `MAX_LOGIN_ATTEMPTS`、`LOGIN_LOCKOUT_DURATION` 登录防爆破
  - `HTTP_PROXY`、`HTTPS_PROXY`（可选）
- 前端-后端连通（Next.js 服务器端环境）
  - `BACKEND_URL` 例如开发 `http://localhost:8000`，容器 `http://backend:8000`
  - `NODE_ENV` `development`/`production`
 - 远程录号 Ingest API（可选，面向 GUI/服务端程序）
   - `INGEST_API_ENABLED` `true/false` 是否启用，默认 `false`
   - `INGEST_API_KEY` HMAC 密钥，用于请求签名（必须强随机）。签名头：
     - `X-Ingest-Ts`: Unix 时间戳秒
     - `X-Ingest-Sign`: `hex(hmac_sha256(key, method + "\n" + path + "\n" + ts + "\n" + sha256hex(body)))`
   - 结合限流键 `ingest:by_ip`

说明：
- 当前后端未使用 JWT；如文档中出现 `JWT_*`、`ALLOWED_ORIGINS`、文件上传相关变量，属于旧文档遗留，不必配置。
- 后端已将公开兑换接口 `/api/redeem` 与 `/api/redeem/resend` 纳入 CSRF 白名单，建议前端通过 `app/api/redeem` 路由转发访问。

---

## 二、开发环境配置

1) 在 `cloud/` 目录创建 `.env.local`（或导出相同变量）

```
BACKEND_URL=http://localhost:8000
NODE_ENV=development
ADMIN_INITIAL_PASSWORD=admin123
SECRET_KEY=dev-secret-key
# 生成：openssl rand -base64 32
ENCRYPTION_KEY=<base64-32-bytes>
```

2) 启动

```
cd cloud
./scripts/start-dev.sh
```

- 端口：前端 `http://localhost:3000`，后端 `http://localhost:8000`
- Next.js 开发代理自动把 `/api/*` 转到后端

---

## 三、生产环境配置

1) 准备 env 文件

- 复制 `cloud/.env.production.example` 为 `cloud/.env` 并填写：
  - `SECRET_KEY` 与 `ENCRYPTION_KEY` 必填且强随机
  - `DOMAIN` 设置为你的站点域名
  - `DATABASE_URL` 建议 Postgres
  - `REDIS_URL` 启用分布式限流

2) 使用生产模板启动（推荐）

```
cd cloud
cp .env.production.example .env
# 编辑 .env
# 如需 PostgreSQL/Redis/Nginx，使用生产 compose 模板：
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

- 前端：`http://<server>:3000`
- 后端：`http://<server>:8000`
- Nginx：`80/443` 端口。将证书放到 `cloud/ssl` 并更新 `cloud/nginx.conf`。

3) 安全要点（后端会强校验）
- `ENV=production` 时，若 `ENCRYPTION_KEY` 或 `SECRET_KEY` 未设置，或初始密码为 `admin`/`admin123`，应用将拒绝启动
- 生产禁止设置 `EXTRA_PASSWORD`
- `DOMAIN` 将影响 Cookie 的安全属性与 CSRF 检查

---

## 四、密钥生成

- 生成 32 字节 base64：
```
openssl rand -base64 32
```
- 生成强随机 `SECRET_KEY`：
```
python - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

---

## 五、常见问题

- 生产限流未生效：未配置 `REDIS_URL` 时使用内存限流，不共享令牌桶；多实例需 Redis
- 403/CSRF：生产需正确设置 `DOMAIN`（与访问域名一致），并通过前端 API 路由或同源调用
- 明文 Token 存储？后端使用 AES-256-GCM 加密 `access_token`；确保 `ENCRYPTION_KEY` 正确
- SMTP 是否必配？当前后端未调用邮件发送逻辑；如无集成，不需配置 `SMTP_*`

---

## 六、文件索引
- 生产示例 env：`cloud/.env.production.example`
- 生产 Compose 模板：`cloud/docker-compose.prod.yml`
- 开发指南：`cloud/DEVELOPMENT.md`
- 快速指引：项目根 `README.md`
