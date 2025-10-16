# API 文档

本文档详细描述了 ChatGPT 团队邀请管理系统的所有 API 接口。

## 📋 目录

- [基础信息](#基础信息)
- [认证机制](#认证机制)
- [错误处理](#错误处理)
- [频率限制](#频率限制)
- [公共 API](#公共-api)
- [管理员 API](#管理员-api)
- [统计 API](#统计-api)
- [系统 API](#系统-api)
- [Ingest API](#ingest-api)

## 🌐 基础信息

- **Base URL**: `http://localhost:8000` (开发环境) / `https://your-domain.com` (生产环境)
- **API 版本**: v1
- **数据格式**: JSON
- **字符编码**: UTF-8

## 🔐 认证机制

### 管理员认证

系统使用基于 Cookie 的会话认证机制：

1. **登录接口**: `POST /api/admin/login`
2. **认证 Cookie**: `admin_session`
3. **会话管理**: 服务端持久化会话，支持多设备登录

#### Cookie 配置

```http
Set-Cookie: admin_session=<signed_token>; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400
```

- **HttpOnly**: 防止 XSS 攻击
- **SameSite=Strict**: 防止 CSRF 攻击
- **Max-Age**: 24小时过期时间

#### CSRF 保护

对于状态变更操作，需要提供 CSRF Token：

```http
X-CSRF-Token: <csrf_token>
```

获取 CSRF Token：`GET /api/admin/csrf-token`

## ⚠️ 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | CSRF 校验失败或权限不足 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

### 业务错误响应

部分接口返回业务层面的成功/失败状态：

```json
{
  "success": false,
  "message": "具体的业务错误信息"
}
```

## 🚦 频率限制

| 接口 | 限制规则 |
|------|----------|
| 公共兑换码提交 | 60次/分钟/IP |
| 公共重发邀请 | 10次/分钟/(IP+邮箱) |
| 管理员登录 | 10次/分钟/IP + 失败锁定 |
| 其他管理操作 | 60次/分钟/IP |

## 🌍 公共 API

### 1. 兑换码提交

提交兑换码并邀请用户加入团队。

**接口地址**: `POST /api/redeem`

**认证要求**: 无需认证

**频率限制**: 60次/分钟/IP

#### 请求参数

```json
{
  "code": "ABC123XYZ",
  "email": "user@example.com"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 兑换码，8-32位字母数字 |
| email | string | 是 | 邮箱地址 |

#### 响应格式

```json
{
  "success": true,
  "message": "邀请发送成功，请查收邮件",
  "invite_request_id": 123,
  "mother_id": 1,
  "team_id": "team_abc123"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 操作是否成功 |
| message | string | 结果消息 |
| invite_request_id | number | 邀请记录ID（成功时） |
| mother_id | number | 母号ID（成功时） |
| team_id | string | 团队ID（成功时） |

#### 错误示例

```json
{
  "success": false,
  "message": "兑换码无效或已使用"
}
```

### 2. 重发邀请

重新发送邀请邮件给指定用户。

**接口地址**: `POST /api/redeem/resend`

**认证要求**: 无需认证

**频率限制**: 10次/分钟/(IP+邮箱)

#### 请求参数

```json
{
  "email": "user@example.com",
  "team_id": "team_abc123"
}
```

#### 响应格式

```json
{
  "success": true,
  "message": "邀请邮件已重新发送"
}
```

## 👨‍💼 管理员 API

所有管理员 API 都需要有效的管理员会话。

### 认证相关

#### 1. 管理员登录

**接口地址**: `POST /api/admin/login`

**认证要求**: 无需认证

**频率限制**: 10次/分钟/IP + 失败锁定机制

#### 请求参数

```json
{
  "password": "admin_password"
}
```

#### 响应格式

```json
{
  "success": true,
  "message": "登录成功"
}
```

成功登录后会设置认证 Cookie。

#### 2. 管理员登出

**接口地址**: `POST /api/admin/logout`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "success": true,
  "message": "已退出登录"
}
```

#### 3. 撤销所有会话

**接口地址**: `POST /api/admin/logout-all`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "success": true,
  "message": "已撤销 3 个会话"
}
```

#### 4. 检查登录状态

**接口地址**: `GET /api/admin/me`

**认证要求**: 可选

#### 响应格式

```json
{
  "authenticated": true
}
```

#### 5. 获取 CSRF Token

**接口地址**: `GET /api/admin/csrf-token`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "csrf_token": "abc123def456..."
}
```

#### 6. 修改密码

**接口地址**: `POST /api/admin/change-password`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "old_password": "old_pass",
  "new_password": "new_pass"
}
```

#### 响应格式

```json
{
  "ok": true
}
```

### 母号管理

#### 1. 创建母号

**接口地址**: `POST /api/admin/mothers`

**认证要求**: 需要管理员会话 + CSRF Token

**频率限制**: 60次/分钟/IP

#### 请求参数

```json
{
  "name": "母号名称",
  "access_token": "sk-xxx...",
  "token_expires_at": "2024-12-31T23:59:59Z",
  "teams": [
    {
      "team_id": "team_abc123",
      "name": "团队名称",
      "is_default": true,
      "is_enabled": true
    }
  ],
  "notes": "备注信息"
}
```

#### 响应格式

```json
{
  "ok": true,
  "mother_id": 123
}
```

#### 2. 获取母号列表

**接口地址**: `GET /api/admin/mothers`

**认证要求**: 需要管理员会话

#### 响应格式

```json
[
  {
    "id": 1,
    "name": "母号1",
    "email": "mother1@example.com",
    "status": "active",
    "seat_limit": 7,
    "seats_used": 3,
    "usage_rate": 0.43,
    "teams_count": 2,
    "enabled_teams_count": 1,
    "created_at": "2024-01-01T00:00:00Z",
    "token_expires_at": "2024-12-31T23:59:59Z"
  }
]
```

#### 3. 更新母号

**接口地址**: `PUT /api/admin/mothers/{mother_id}`

**认证要求**: 需要管理员会话

#### 请求参数

同创建母号，但所有字段都是可选的。

#### 4. 删除母号

**接口地址**: `DELETE /api/admin/mothers/{mother_id}`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "ok": true,
  "message": "母号删除成功"
}
```

### 批量操作

#### 1. 文本批量导入

**接口地址**: `POST /api/admin/mothers/batch/import-text`

**认证要求**: 需要管理员会话

**Content-Type**: `text/plain; charset=utf-8`

#### 请求格式

每行一条记录，格式：`邮箱---accessToken`

```
user1@example.com---sk-xxx1
user2@example.com---sk-xxx2
```

#### 响应格式

```json
[
  {
    "index": 1,
    "success": true,
    "mother_id": 123
  },
  {
    "index": 2,
    "success": false,
    "error": "邮箱格式错误"
  }
]
```

#### 2. 结构化数据校验

**接口地址**: `POST /api/admin/mothers/batch/validate`

**认证要求**: 需要管理员会话

#### 请求参数

```json
[
  {
    "name": "母号名称",
    "email": "mother@example.com",
    "access_token": "sk-xxx",
    "teams": [
      {
        "team_id": "team_123",
        "name": "团队名",
        "is_default": true,
        "is_enabled": true
      }
    ]
  }
]
```

#### 响应格式

```json
[
  {
    "index": 1,
    "valid": true,
    "warnings": ["团队名称已存在"]
  },
  {
    "index": 2,
    "valid": false,
    "errors": ["缺少 access_token"]
  }
]
```

#### 3. 结构化数据导入

**接口地址**: `POST /api/admin/mothers/batch/import`

**认证要求**: 需要管理员会话

#### 请求参数

同校验接口的数据格式。

#### 响应格式

```json
[
  {
    "index": 1,
    "success": true,
    "mother_id": 123,
    "message": "创建成功"
  },
  {
    "index": 2,
    "success": false,
    "error": "邮箱已存在"
  }
]
```

### 兑换码管理

#### 1. 生成兑换码

**接口地址**: `POST /api/admin/codes`

**认证要求**: 需要管理员会话 + CSRF Token

**频率限制**: 60次/分钟/IP

#### 请求参数

```json
{
  "count": 100,
  "prefix": "BATCH1",
  "expires_at": "2024-12-31T23:59:59Z",
  "batch_id": "batch_123"
}
```

#### 响应格式

```json
{
  "batch_id": "batch_123",
  "codes": [
    "BATCH1ABC123",
    "BATCH1DEF456"
  ],
  "enabled_teams": 5,
  "max_code_capacity": 35,
  "active_codes": 10,
  "remaining_quota": 25
}
```

#### 2. 获取兑换码列表

**接口地址**: `GET /api/admin/codes`

**认证要求**: 需要管理员会话

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 筛选状态：all, unused, used |
| batch_id | string | 否 | 批次ID筛选 |
| mother_id | number | 否 | 母号ID筛选 |
| team_id | string | 否 | 团队ID筛选 |
| limit | number | 否 | 分页大小，默认100 |
| offset | number | 否 | 分页偏移，默认0 |

#### 响应格式

```json
[
  {
    "id": 1,
    "code": "BATCH1ABC123",
    "batch_id": "batch_123",
    "is_used": true,
    "expires_at": "2024-12-31T23:59:59Z",
    "created_at": "2024-01-01T00:00:00Z",
    "used_by": "user@example.com",
    "used_at": "2024-01-02T12:00:00Z",
    "mother_id": 1,
    "mother_name": "母号1",
    "team_id": "team_123",
    "team_name": "团队1",
    "invite_status": "sent"
  }
]
```

#### 3. 禁用兑换码

**接口地址**: `POST /api/admin/codes/{code_id}/disable`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "ok": true,
  "message": "兑换码已禁用"
}
```

#### 4. 导出兑换码

**接口地址**: `GET /api/admin/export/codes`

**认证要求**: 需要管理员会话

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| format | string | 是 | 导出格式：csv, txt |
| status | string | 否 | 筛选状态：all, unused, used |

#### 响应格式

**CSV 格式**：
```csv
code,batch,is_used,created_at,used_by,used_at,mother_name,team_name
BATCH1ABC123,batch_123,true,2024-01-01,user@example.com,2024-01-02,母号1,团队1
```

**TXT 格式**：
```
BATCH1ABC123
BATCH1DEF456
```

### 用户管理

#### 1. 获取用户列表

**接口地址**: `GET /api/admin/users`

**认证要求**: 需要管理员会话

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 状态筛选 |
| team_id | string | 否 | 团队ID筛选 |
| limit | number | 否 | 分页大小 |
| offset | number | 否 | 分页偏移 |

#### 响应格式

```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "status": "active",
    "team_id": "team_123",
    "team_name": "团队1",
    "invited_at": "2024-01-01T12:00:00Z",
    "redeemed_at": "2024-01-01T13:00:00Z",
    "code_used": "BATCH1ABC123"
  }
]
```

#### 2. 重发邀请

**接口地址**: `POST /api/admin/resend`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "email": "user@example.com",
  "team_id": "team_123"
}
```

#### 3. 取消邀请

**接口地址**: `POST /api/admin/cancel-invite`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "email": "user@example.com",
  "team_id": "team_123"
}
```

#### 4. 移除成员

**接口地址**: `POST /api/admin/remove-member`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "email": "user@example.com",
  "team_id": "team_123"
}
```

### 批量操作

#### 1. 支持的批量操作

**接口地址**: `GET /api/admin/batch/supported-actions`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "codes": ["disable"],
  "users": ["resend", "cancel", "remove"]
}
```

#### 2. 批量操作兑换码

**接口地址**: `POST /api/admin/batch/codes`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "action": "disable",
  "ids": [1, 2, 3],
  "confirm": true
}
```

#### 响应格式

```json
{
  "success_count": 2,
  "failure_count": 1,
  "results": [
    {
      "id": 1,
      "success": true
    },
    {
      "id": 2,
      "success": false,
      "error": "兑换码已使用"
    }
  ]
}
```

#### 3. 批量操作用户

**接口地址**: `POST /api/admin/batch/users`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "action": "resend",
  "ids": [1, 2, 3],
  "confirm": true
}
```

### Cookie 导入

#### 1. 导入 Cookie 获取 Token

**接口地址**: `POST /api/admin/import-cookie`

**认证要求**: 需要管理员会话 + CSRF Token

**频率限制**: 60次/分钟/IP

#### 请求参数

```json
{
  "cookie": "session_token=xxx; other_cookie=yyy"
}
```

#### 响应格式

```json
{
  "access_token": "sk-xxx...",
  "token_expires_at": "2024-12-31T23:59:59Z",
  "user_email": "user@example.com",
  "account_id": "acc_123"
}
```

### 审计日志

#### 1. 获取审计日志

**接口地址**: `GET /api/admin/audit-logs`

**认证要求**: 需要管理员会话

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 限制条数，最大1000 |
| offset | number | 否 | 偏移量 |

#### 响应格式

```json
[
  {
    "id": 1,
    "actor": "admin",
    "action": "create_mother",
    "target_type": "mother",
    "target_id": 123,
    "payload_redacted": {"name": "母号1"},
    "ip": "192.168.1.1",
    "ua": "Mozilla/5.0...",
    "created_at": "2024-01-01T12:00:00Z"
  }
]
```

## 📊 统计 API

### 1. 综合统计

**接口地址**: `GET /api/admin/stats`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "codes": {
    "total": 1000,
    "used": 600,
    "unused": 350,
    "expired": 50
  },
  "seats": {
    "total": 70,
    "used": 42,
    "free": 28,
    "usage_rate": 0.6
  },
  "invites": {
    "total": 600,
    "pending": 50,
    "accepted": 500,
    "cancelled": 30,
    "failed": 20
  },
  "mothers": {
    "total": 10,
    "active": 8,
    "invalid": 2
  },
  "teams": {
    "total": 15,
    "enabled": 12
  },
  "recent_activity": [
    {
      "date": "2024-01-01",
      "invites": 25,
      "redemptions": 20
    }
  ],
  "status_breakdown": {
    "pending": 50,
    "sent": 300,
    "accepted": 200,
    "cancelled": 30
  },
  "mother_usage": [
    {
      "id": 1,
      "name": "母号1",
      "seat_limit": 7,
      "seats_used": 5,
      "usage_rate": 0.71,
      "status": "active"
    }
  ],
  "batch_breakdown": [
    {
      "batch_id": "batch_123",
      "total": 100,
      "used": 60,
      "unused": 40
    }
  ],
  "provider_metrics": {
    "api_calls": 1500,
    "success_rate": 0.95,
    "avg_response_time": 0.5
  },
  "enabled_teams": 12,
  "max_code_capacity": 84,
  "active_codes": 350,
  "remaining_code_quota": 34
}
```

### 2. 仪表板统计

**接口地址**: `GET /api/admin/stats/dashboard`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "today": {
    "invites_sent": 25,
    "invites_accepted": 20,
    "redemptions": 18,
    "failures": 2
  },
  "this_week": {
    "invites_sent": 120,
    "invites_accepted": 100,
    "redemptions": 90,
    "failures": 10
  }
}
```

### 3. 趋势统计

**接口地址**: `GET /api/admin/stats/trends`

**认证要求**: 需要管理员会话

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数，最大90，默认30 |

#### 响应格式

```json
{
  "trends": [
    {
      "date": "2024-01-01",
      "invites": 25,
      "redemptions": 20,
      "successful": 23,
      "failed": 2
    }
  ]
}
```

## 🔧 系统 API

### 1. Prometheus 指标

**接口地址**: `GET /metrics`

**认证要求**: 生产环境需要管理员会话

**响应格式**: Prometheus 文本格式

### 2. 健康检查

**接口地址**: `GET /health`

**认证要求**: 无

#### 响应格式

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0"
}
```

### 3. 性能统计

**接口地址**: `GET /api/admin/performance/stats`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "total_operations": 10000,
  "operations": [
    {
      "endpoint": "/api/admin/mothers",
      "count": 1500,
      "avg_duration": 0.05,
      "max_duration": 0.2
    }
  ],
  "slow_queries": [
    {
      "query": "SELECT * FROM mothers WHERE...",
      "count": 5,
      "avg_duration": 0.5
    }
  ],
  "enabled": true
}
```

## 📦 Ingest API

Ingest API 面向受信任的 GUI/服务端工具，用于“远程录号”（创建母号）。

特性：
- HMAC-SHA256 请求签名 + 时间戳
- 按 IP 限流（默认 60 次/分钟）
- CSRF 豁免（仅此路由）

启用（环境变量）：
- `INGEST_API_ENABLED=true`
- `INGEST_API_KEY=<强随机密钥>`

### 1. 创建母号（远程录入）

**接口地址**: `POST /api/ingest/mothers`

**认证**: 通过签名头部

**频率限制**: 60 次/分钟/IP

**签名头部**:

```
X-Ingest-Ts: <unix_timestamp_seconds>
X-Ingest-Sign: hex(hmac_sha256(INGEST_API_KEY, method + "\n" + path + "\n" + ts + "\n" + sha256hex(body)))
```

签名说明：
- method: 大写 HTTP 方法，如 `POST`
- path: 路径部分，如 `/api/ingest/mothers`
- ts: 与服务器相差不超过 ±300 秒
- body: 原始请求体字节，取 SHA-256 的十六进制摘要作为参与签名字符串最后一行

**请求体（与 `MotherCreateIn` 一致）**:

```json
{
  "name": "mother@example.com",
  "access_token": "sk-...",
  "token_expires_at": "2025-12-31T23:59:59Z",
  "notes": "optional",
  "teams": [
    { "team_id": "team-1", "team_name": "Team 1", "is_enabled": true, "is_default": true },
    { "team_id": "team-2", "team_name": "Team 2", "is_enabled": true, "is_default": false }
  ]
}
```

字段说明：
- `name` 必填；`access_token` 必填；`teams` 可为空（后续在管理台补录）
- `token_expires_at` 可选；未提供时服务端按策略默认 +N 天

**成功响应**:

```json
{ "ok": true, "mother_id": 123 }
```

**失败响应**:

```json
{ "detail": "Invalid signature" }
```

**示例（Python 生成签名）**:

```python
import time, hmac, hashlib, json, requests

key = b"<INGEST_API_KEY>"
path = "/api/ingest/mothers"
method = "POST"
ts = str(int(time.time()))
body = json.dumps({
  "name": "mother@example.com",
  "access_token": "sk-...",
  "teams": [{"team_id": "team-1", "is_enabled": True, "is_default": True}],
}).encode("utf-8")
body_hash = hashlib.sha256(body).hexdigest()
msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode("utf-8")
sign = hmac.new(key, msg, hashlib.sha256).hexdigest()

r = requests.post(
  f"http://localhost:8000{path}",
  headers={"X-Ingest-Ts": ts, "X-Ingest-Sign": sign, "Content-Type": "application/json"},
  data=body,
)
print(r.status_code, r.text)
```

### 4. 性能监控控制

**接口地址**: `POST /api/admin/performance/toggle`

**认证要求**: 需要管理员会话

#### 请求参数

```json
{
  "enabled": true
}
```

#### 响应格式

```json
{
  "ok": true,
  "message": "性能监控已开启",
  "enabled": true
}
```

### 5. 重置性能统计

**接口地址**: `POST /api/admin/performance/reset`

**认证要求**: 需要管理员会话

#### 响应格式

```json
{
  "ok": true,
  "message": "性能统计已重置"
}
```

## 📝 业务规则说明

### 兑换码生成配额

可生成兑换码数量计算公式：
```
配额 = 所有活跃母号启用团队下的空位总数 - 未过期未使用的兑换码数量
```

### 母号选择策略

1. 优先选择 `created_at` 最早的母号
2. 仅选择状态为 `active` 的母号
3. 母号必须有至少一个启用的团队
4. 母号必须有可用空位
5. 同一邮箱不能重复加入同一团队

### 并发控制

- **兑换码使用**: 使用数据库行级锁防止重复使用
- **座位占用**: 先标记为 `held` 状态（30秒超时），再更新为 `used`
- **CAS 操作**: 使用 Compare-And-Swap 模式保证数据一致性

### 数据安全

- **敏感数据加密**: Access Token 使用 AES-256-GCM 加密存储
- **兑换码哈希**: 兑换码仅存储哈希值，明文仅在生成时返回
- **审计日志**: 所有管理操作记录审计日志
- **会话安全**: 使用签名 Cookie 防止篡改

## 🔍 调试建议

### 1. 开启调试模式

在开发环境中设置环境变量：
```bash
DEBUG=true
LOG_LEVEL=debug
```

### 2. 查看详细日志

```bash
# 后端日志
tail -f cloud/logs/app.log

# 前端日志
# 浏览器开发者工具 Console
```

### 3. 使用 API 文档

访问 FastAPI 自动生成的 Swagger 文档：
```
http://localhost:8000/docs
```

### 4. 测试认证流程

```bash
# 1. 登录获取会话
curl -c cookies.txt -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "admin_password"}'

# 2. 使用会话访问受保护接口
curl -b cookies.txt http://localhost:8000/api/admin/me
```

---

如有其他问题，请查看 [故障排除指南](./TROUBLESHOOTING.md) 或联系开发团队。
