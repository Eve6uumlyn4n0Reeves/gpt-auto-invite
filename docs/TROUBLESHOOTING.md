# 故障排除指南

本文档提供 ChatGPT 团队邀请管理系统常见问题的诊断和解决方案。

## 📋 目录

- [快速诊断](#快速诊断)
- [安装和部署问题](#安装和部署问题)
- [数据库问题](#数据库问题)
- [API 接口问题](#api-接口问题)
- [前端问题](#前端问题)
- [认证和授权问题](#认证和授权问题)
- [性能问题](#性能问题)
- [邮件服务问题](#邮件服务问题)
- [监控和日志问题](#监控和日志问题)
- [网络连接问题](#网络连接问题)
- [数据恢复问题](#数据恢复问题)
- [调试工具和技巧](#调试工具和技巧)

## 🔍 快速诊断

### 健康检查清单

在开始详细诊断前，先运行快速检查：

```bash
# 1. 检查服务状态
docker-compose ps

# 2. 检查系统资源
df -h
free -h
top

# 3. 检查网络连接
curl -I http://localhost:8000/health
curl -I http://localhost:3000

# 4. 检查日志
docker-compose logs --tail=50
```

### 常见错误症状

| 症状 | 可能原因 | 快速解决方案 |
|------|----------|-------------|
| 服务无法启动 | 端口被占用/配置错误 | 检查端口占用、环境变量 |
| 数据库连接失败 | 数据库未启动/密码错误 | 检查数据库服务、连接字符串 |
| 502 Bad Gateway | 后端服务未响应 | 重启后端服务、检查日志 |
| 前端白屏 | 构建错误/资源加载失败 | 重新构建、检查网络 |
| 登录失败 | 会话配置错误 | 检查密钥配置、Cookie 设置 |

## 🚀 安装和部署问题

### 问题 1: Docker Compose 启动失败

#### 症状
```bash
ERROR: Service 'backend' failed to build: The command '/bin/sh -c pip install --no-cache-dir -r requirements.txt' returned a non-zero code: 1
```

#### 可能原因
- Python 版本不兼容
- 网络连接问题
- 依赖包安装失败

#### 解决方案

```bash
# 1. 检查 Docker 版本
docker --version
docker-compose --version

# 2. 清理 Docker 缓存
docker system prune -a
docker builder prune -a

# 3. 重新构建
docker-compose build --no-cache

# 4. 如果仍有问题，检查具体的错误日志
docker-compose build backend
```

#### 预防措施
- 使用稳定版本的 Docker 和 Docker Compose
- 在 `requirements.txt` 中固定依赖版本
- 配置 Docker 镜像加速器

### 问题 2: 端口占用

#### 症状
```bash
ERROR: for nginx  Cannot start service nginx: driver failed programming external connectivity on endpoint invite_nginx: Bind for 0.0.0.0:80 failed: port is already allocated
```

#### 解决方案

```bash
# 1. 查看端口占用
netstat -tlnp | grep :80
lsof -i :80

# 2. 停止占用端口的服务
sudo systemctl stop nginx  # 如果是系统 nginx
sudo kill -9 <PID>        # 如果是其他进程

# 3. 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:80"  # 改为其他端口
```

### 问题 3: 环境变量配置错误

#### 症状
服务启动后立即退出，日志显示配置错误。

#### 诊断步骤

```bash
# 1. 检查环境变量文件
cat .env

# 2. 验证必需变量
docker-compose config

# 3. 检查文件权限
ls -la .env
```

#### 解决方案

```bash
# 1. 使用示例文件重新创建
cp .env.example .env

# 2. 编辑配置文件
nano .env

# 3. 确保包含所有必需变量
grep -v '^#' .env | grep -v '^$'
```

## 🗄️ 数据库问题

### 问题 1: 数据库连接失败

#### 症状
```bash
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) could not connect to server: Connection refused
```

#### 诊断步骤

```bash
# 1. 检查数据库容器状态
docker-compose ps postgres

# 2. 查看数据库日志
docker-compose logs postgres

# 3. 测试数据库连接
docker-compose exec postgres psql -U postgres -d invite_db -c "SELECT 1;"
```

#### 解决方案

```bash
# 1. 重启数据库服务
docker-compose restart postgres

# 2. 等待数据库完全启动
sleep 10

# 3. 检查网络连接
docker-compose exec backend ping postgres

# 4. 验证连接字符串
echo $DATABASE_URL
```

### 问题 2: 迁移相关错误（忽略）

当前后端未使用 Alembic，应用在启动时自动创建表结构。如日志中出现 Alembic 相关命令/错误，说明引用了旧文档或脚本，请改用现有部署方式（参见 docs/DEPLOYMENT.md 与 cloud/docker-compose.prod.yml）。

### 问题 3: 数据库性能问题

#### 症状
API 响应缓慢，数据库查询超时。

#### 诊断

```sql
-- 1. 查看活跃连接
SELECT * FROM pg_stat_activity WHERE state = 'active';

-- 2. 查看慢查询
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 10;

-- 3. 查看表大小
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### 解决方案

```sql
-- 1. 创建缺失的索引
CREATE INDEX CONCURRENTLY idx_codes_status ON codes(is_used, expires_at);
CREATE INDEX CONCURRENTLY idx_users_email_team ON users(email, team_id);

-- 2. 更新表统计信息
ANALYZE;

-- 3. 清理无用数据
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- 4. 优化数据库配置
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET work_mem = '4MB';
SELECT pg_reload_conf();
```

## 🔌 API 接口问题

### 问题 1: 500 内部服务器错误

#### 症状
API 请求返回 500 状态码。

#### 诊断步骤

```bash
# 1. 查看后端日志
docker-compose logs backend | tail -50

# 2. 查看详细错误信息
docker-compose exec backend tail -f /app/logs/app.log

# 3. 检查应用健康状态
curl -v http://localhost:8000/health
```

#### 常见原因和解决方案

```bash
# 1. 数据库连接问题
# 检查数据库状态
docker-compose exec postgres pg_isready

# 2. 环境变量缺失
# 检查环境变量
docker-compose exec backend env | grep -E "(DATABASE_URL|SECRET_KEY)"

# 3. 依赖包问题
# 重新安装依赖
docker-compose exec backend pip install -r requirements.txt
```

### 问题 2: CORS 错误

#### 症状
浏览器控制台显示 CORS 错误：
```
Access to fetch at 'http://localhost:8000/api/admin/login' from origin 'http://localhost:3000' has been blocked by CORS policy
```

#### 解决方案

```python
# 检查 backend/app/main.py 中的 CORS 配置
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 确保包含前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 问题 3: 认证失败

#### 症状
登录接口返回 401 错误，无法获取会话。

#### 诊断步骤

```bash
# 1. 检查管理员密码配置
echo $ADMIN_INITIAL_PASSWORD

# 2. 测试登录接口
curl -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your_password"}' \
  -v

# 3. 检查会话表
docker-compose exec backend python -c "
from app.database import SessionLocal
from app.models import AdminSession
db = SessionLocal()
sessions = db.query(AdminSession).all()
print(f'Sessions: {len(sessions)}')
for s in sessions[-5:]:
    print(f'{s.id}: {s.created_at} - {s.revoked}')
"
```

#### 解决方案

```bash
# 1. 重置管理员密码
docker-compose exec backend python -c "
from app.database import SessionLocal
from app.core.security import get_password_hash
from app.models import AdminConfig
db = SessionLocal()
config = db.query(AdminConfig).first()
if config:
    config.password_hash = get_password_hash('new_password')
    db.commit()
    print('Password reset successfully')
"

# 2. 清理所有会话
docker-compose exec backend python -c "
from app.database import SessionLocal
from app.models import AdminSession
db = SessionLocal()
db.query(AdminSession).update({'revoked': True})
db.commit()
print('All sessions revoked')
"
```

## 🎨 前端问题

### 问题 1: 前端白屏

#### 症状
浏览器显示空白页面，控制台可能有错误信息。

#### 诊断步骤

```bash
# 1. 检查前端构建日志
docker-compose logs frontend

# 2. 查看浏览器控制台错误
# 打开浏览器开发者工具，查看 Console 和 Network 标签

# 3. 检查前端服务状态
curl -I http://localhost:3000
```

#### 常见解决方案

```bash
# 1. 重新构建前端
docker-compose build --no-cache frontend
docker-compose up -d frontend

# 2. 检查环境变量
docker-compose exec frontend env | grep BACKEND_URL

# 3. 检查 Next.js 配置
cat cloud/web/next.config.js
```

### 问题 2: API 请求失败

#### 症状
前端无法正确调用后端 API。

#### 诊断

```javascript
// 在浏览器控制台中测试 API 调用
fetch('/api/admin/me')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

#### 解决方案

```typescript
// 1. 检查 API 客户端配置
// cloud/web/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 2. 检查请求拦截器
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 确保 Cookie 被发送
});

// 3. 添加错误处理
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);
```

### 问题 3: 状态管理问题

#### 症状
React 组件状态更新不正确，UI 不刷新。

#### 诊断工具

```typescript
// 1. 使用 React DevTools
// 安装浏览器扩展：React Developer Tools

// 2. 添加调试日志
console.log('State updated:', { state, props });

// 3. 检查 Redux 状态
import { useSelector } from 'react-redux';

const DebugComponent = () => {
  const auth = useSelector(state => state.auth);
  console.log('Auth state:', auth);
  return null;
};
```

## 🔐 认证和授权问题

### 问题 1: CSRF Token 错误

#### 症状
POST 请求返回 403 错误，提示 CSRF token 无效。

#### 诊断

```bash
# 1. 检查 CSRF token 获取
curl -b cookies.txt http://localhost:8000/api/admin/csrf-token

# 2. 检查请求头
curl -X POST http://localhost:8000/api/admin/login \
  -H "X-CSRF-Token: your_token" \
  -H "Content-Type: application/json" \
  -d '{"password": "password"}' \
  -v
```

#### 解决方案

```typescript
// 1. 确保 CSRF token 正确获取和使用
const csrfToken = await fetch('/api/admin/csrf-token')
  .then(res => res.json())
  .then(data => data.csrf_token);

// 2. 在请求中包含 CSRF token
const response = await fetch('/api/admin/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  credentials: 'include',
  body: JSON.stringify({ password }),
});
```

### 问题 2: 会话过期

#### 症状
用户操作频繁被要求重新登录。

#### 解决方案

```python
# 检查会话配置
# backend/app/core/security.py

SESSION_EXPIRE_MINUTES = 1440  # 24小时
SESSION_REFRESH_THRESHOLD = 60  # 1小时内刷新

# 延长会话时间
SESSION_EXPIRE_MINUTES = 4320  # 72小时
```

```typescript
// 前端自动刷新令牌
const refreshSession = async () => {
  try {
    await fetch('/api/admin/refresh', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Session refresh failed:', error);
    // 重定向到登录页面
    window.location.href = '/admin/login';
  }
};
```

## ⚡ 性能问题

### 问题 1: API 响应缓慢

#### 症状
API 请求耗时过长，用户体验差。

#### 诊断

```bash
# 1. 测试 API 响应时间
time curl http://localhost:8000/api/admin/mothers

# 2. 查看系统资源使用
htop
iotop

# 3. 分析数据库查询
docker-compose exec backend python -c "
from app.database import SessionLocal
from app.models import Mother
import time

db = SessionLocal()
start_time = time.time()
mothers = db.query(Mother).all()
end_time = time.time()
print(f'Query took {end_time - start_time:.2f} seconds for {len(mothers)} records')
"
```

#### 优化方案

```python
# 1. 添加数据库查询优化
from sqlalchemy.orm import joinedload

# 预加载关联数据
mothers = db.query(Mother).options(
    joinedload(Mother.teams),
    joinedload(Mother.seats)
).all()

# 2. 添加分页
def get_mothers(skip: int = 0, limit: int = 100):
    return db.query(Mother).offset(skip).limit(limit).all()

# 3. 添加缓存
from app.core.cache import cache_result

@cache_result(expire_time=300)
def get_stats():
    # 计算密集的统计查询
    pass
```

### 问题 2: 前端加载缓慢

#### 症状
页面加载时间长，组件渲染慢。

#### 解决方案

```typescript
// 1. 使用代码分割
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

// 2. 优化图片加载
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={120}
  height={40}
  priority={false}
  loading="lazy"
/>

// 3. 使用虚拟化列表
import { FixedSizeList as List } from 'react-window';

const VirtualizedTable = ({ items }) => (
  <List
    height={600}
    itemCount={items.length}
    itemSize={50}
  >
    {({ index, style }) => (
      <div style={style}>
        {items[index].name}
      </div>
    )}
  </List>
);
```

## 📧 邮件服务问题（未集成）

### 问题 1: 邮件发送失败

#### 症状
当前后端未集成邮件发送逻辑，SMTP 相关步骤仅供扩展参考；如未自建邮件模块可忽略本节。

#### 诊断

```bash
# 1. 检查邮件配置
docker-compose exec backend python -c "
import os
from smtplib import SMTP
print('SMTP Host:', os.getenv('SMTP_HOST'))
print('SMTP Port:', os.getenv('SMTP_PORT'))
print('SMTP User:', os.getenv('SMTP_USER'))
"

# 2. 测试邮件连接
docker-compose exec backend python -c "
import smtplib
from email.mime.text import MIMEText

msg = MIMEText('Test email')
msg['Subject'] = 'Test'
msg['From'] = 'sender@example.com'
msg['To'] = 'recipient@example.com'

try:
    with smtplib.SMTP('smtp.gmail.com', 587) as server:
        server.starttls()
        server.login('user', 'password')
        server.send_message(msg)
    print('Email sent successfully')
except Exception as e:
    print(f'Error: {e}')
"
```

#### 解决方案

```python
# 1. 检查 SMTP 配置
# backend/app/services/email.py

def test_email_connection():
    try:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        if settings.SMTP_TLS:
            server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.quit()
        return True
    except Exception as e:
        logger.error(f"Email connection failed: {e}")
        return False

# 2. 添加邮件发送重试机制
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def send_invite_email(email: str, invite_url: str):
    # 邮件发送逻辑
    pass
```

### 问题 2: Gmail 应用密码问题

#### 症状
使用 Gmail 发送邮件时出现认证失败。

#### 解决方案

1. **启用两步验证**
   - 登录 Google 账户
   - 进入安全性设置
   - 启用两步验证

2. **生成应用密码**
   - 进入 Google 账户的安全性设置
   - 选择"应用密码"
   - 生成新密码用于应用

3. **更新配置**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_generated_app_password  # 使用应用密码，不是账户密码
   SMTP_TLS=true
   ```

## 📊 监控和日志问题

### 问题 1: 日志文件过大

#### 症状
磁盘空间被日志文件占满。

#### 解决方案

```bash
# 1. 配置日志轮转
sudo nano /etc/logrotate.d/invite-system

# 内容：
/app/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 app app
    postrotate
        docker-compose exec backend kill -USR1 1
    endscript
}

# 2. 清理旧日志
find /app/logs -name "*.log.*" -mtime +30 -delete

# 3. 压缩大日志文件
gzip /app/logs/app.log.1
```

### 问题 2: 监控指标缺失

#### 症状
Prometheus 无法收集到应用指标。

#### 解决方案

```python
# 1. 确保 metrics 端点正确配置
# backend/app/main.py

from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'HTTP request duration')

@app.get("/metrics")
async def metrics():
    if settings.ENVIRONMENT == "production":
        # 生产环境需要认证
        await require_admin(request)
    return Response(generate_latest(), media_type="text/plain")

# 2. 添加中间件收集指标
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    REQUEST_COUNT.labels(method=request.method, endpoint=request.url.path).inc()
    REQUEST_DURATION.observe(duration)

    return response
```

## 🌐 网络连接问题

### 问题 1: 容器间网络通信失败

#### 症状
容器无法相互通信，出现连接超时。

#### 诊断

```bash
# 1. 检查网络配置
docker network ls
docker network inspect invite_network

# 2. 测试容器间连接
docker-compose exec backend ping postgres
docker-compose exec frontend ping backend

# 3. 检查 DNS 解析
docker-compose exec backend nslookup postgres
```

#### 解决方案

```bash
# 1. 重建网络
docker network prune
docker-compose down
docker-compose up -d

# 2. 检查 docker-compose.yml 中的网络配置
networks:
  default:
    name: invite_network
    driver: bridge
```

### 问题 2: 外部网络访问失败

#### 症状
容器无法访问外部服务（如 ChatGPT API）。

#### 诊断

```bash
# 1. 测试 DNS 解析
docker-compose exec backend nslookup api.openai.com

# 2. 测试网络连接
docker-compose exec backend curl -I https://api.openai.com

# 3. 检查防火墙设置
sudo ufw status
iptables -L
```

#### 解决方案

```bash
# 1. 配置 DNS
# /etc/docker/daemon.json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}

# 2. 重启 Docker
sudo systemctl restart docker

# 3. 配置代理（如果需要）
# docker-compose.yml
environment:
  - HTTP_PROXY=http://proxy.example.com:8080
  - HTTPS_PROXY=http://proxy.example.com:8080
```

## 💾 数据恢复问题

### 问题 1: 数据库备份损坏

#### 症状
备份文件无法正常恢复。

#### 解决方案

```bash
# 1. 检查备份文件完整性
gzip -t backup.sql.gz
file backup.sql.gz

# 2. 尝试部分恢复
gunzip -c backup.sql.gz | head -100  # 查看文件开头

# 3. 使用 pg_restore 处理自定义格式
pg_restore -h localhost -U postgres -d invite_db --verbose backup.dump

# 4. 从多个备份文件恢复
# 先恢复结构，再恢复数据
pg_restore -h localhost -U postgres -d invite_db --schema-only backup.dump
pg_restore -h localhost -U postgres -d invite_db --data-only backup.dump
```

### 问题 2: 误删数据恢复

#### 症状
重要数据被意外删除。

#### 解决方案

```sql
-- 1. 检查时间点恢复（PITR）是否可用
SELECT pg_is_in_recovery();

-- 2. 从审计日志恢复
SELECT * FROM audit_logs
WHERE action = 'DELETE'
  AND target_type = 'mother'
  AND created_at > '2024-01-01'
ORDER BY created_at DESC;

-- 3. 使用事务回滚（如果在事务中）
BEGIN;
-- 执行删除操作
-- 发现错误后
ROLLBACK;

-- 4. 从备份恢复特定表
pg_restore -h localhost -U postgres -d invite_db \
  --table=mothers --data-only backup.dump
```

## 🛠️ 调试工具和技巧

### 1. 日志调试

```python
# 添加详细日志
import logging

logger = logging.getLogger(__name__)

async def some_function():
    logger.info("Function started")
    try:
        result = await risky_operation()
        logger.info(f"Operation succeeded: {result}")
    except Exception as e:
        logger.error(f"Operation failed: {e}", exc_info=True)
        raise
```

### 2. 数据库调试

```python
# 记录 SQL 查询
import logging

# 配置 SQLAlchemy 日志
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
logging.getLogger('sqlalchemy.pool').setLevel(logging.DEBUG)

# 查看生成的 SQL
from sqlalchemy.dialects import postgresql

query = db.query(Mother).filter(Mother.is_active == True)
print(query.statement.compile(compile_kwargs={"dialect": postgresql.dialect}))
```

### 3. API 调试

```bash
# 使用 curl 测试 API
curl -v -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "test"}' \
  -c cookies.txt

# 查看响应头
curl -I http://localhost:8000/api/admin/me \
  -b cookies.txt

# 使用 httpie (更友好的 curl 替代)
http POST localhost:8000/api/admin/login password=test
```

### 4. 前端调试

```typescript
// React DevTools
// 安装浏览器扩展，查看组件树和状态

// Redux DevTools
import { configureStore } from '@reduxjs/toolkit';

const store = configureStore({
  reducer: rootReducer,
  devTools: process.env.NODE_ENV !== 'production',
});

// 网络调试
// 在浏览器开发者工具的 Network 标签中：
// - 查看请求/响应详情
// - 检查请求头
// - 模拟慢速网络
```

### 5. 性能分析

```python
# Python 性能分析
import cProfile
import pstats

def profile_function():
    pr = cProfile.Profile()
    pr.enable()

    # 要分析的代码
    result = expensive_function()

    pr.disable()
    stats = pstats.Stats(pr)
    stats.sort_stats('cumulative')
    stats.print_stats(10)

    return result
```

```bash
# 内存使用分析
pip install memory_profiler

# 代码中添加装饰器
@profile
def memory_intensive_function():
    # 函数实现
    pass

# 运行分析
python -m memory_profiler script.py
```

## 📞 获取帮助

### 收集诊断信息

在寻求帮助前，请收集以下信息：

```bash
#!/bin/bash
# scripts/collect-diagnostics.sh

echo "=== 系统信息 ==="
uname -a
docker --version
docker-compose --version

echo "=== 服务状态 ==="
docker-compose ps

echo "=== 最近的日志 ==="
echo "=== Backend Logs ==="
docker-compose logs --tail=100 backend

echo "=== Frontend Logs ==="
docker-compose logs --tail=100 frontend

echo "=== 数据库 Logs ==="
docker-compose logs --tail=100 postgres

echo "=== 系统资源 ==="
df -h
free -h
top -bn1 | head -20

echo "=== 网络连接 ==="
netstat -tlnp | grep -E ':(80|443|3000|8000|5432)'

echo "=== 配置文件 ==="
echo ".env 文件 (敏感信息已隐藏):"
grep -v -E '(PASSWORD|SECRET|KEY|TOKEN)' .env

echo "=== Docker Compose 配置 ==="
docker-compose config
```

### 联系支持

1. **创建 Issue**: 在 GitHub 仓库创建详细的 Issue
2. **包含日志**: 提供完整的错误日志
3. **描述环境**: 说明操作系统、Docker 版本等
4. **重现步骤**: 提供详细的问题重现步骤

### 紧急故障处理

如果系统完全不可用：

1. **切换到备份系统**（如果有）
2. **保存现场数据**：收集所有日志和配置
3. **快速回滚**：使用之前的可用版本
4. **联系技术支持**：提供收集的诊断信息

---

**提示**: 大多数问题都可以通过查看日志和检查配置文件来解决。建议在修改配置前先备份原始文件。
