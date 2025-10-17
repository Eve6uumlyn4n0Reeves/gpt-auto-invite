# 分布式限流器文档

## 概述

本项目已成功升级为基于Redis的分布式限流器，支持多实例部署和动态配置管理。

## 特性

- ✅ **分布式限流**: 基于Redis的令牌桶算法，支持多实例共享限流状态
- ✅ **动态配置**: 支持运行时更新限流参数，无需重启服务
- ✅ **降级机制**: Redis不可用时自动降级到内存限流器
- ✅ **统计监控**: 提供详细的限流统计和监控接口
- ✅ **多种策略**: 支持IP、邮箱、路径等多种键生成策略
- ✅ **前端集成（提示层）**: 提供实时限流状态显示和管理界面；前端限流仅作用户体验提示，后端限流为最终裁决

## 架构设计

### 后端架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   FastAPI App   │───▶│ Redis限流器      │───▶│    Redis        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  限流中间件     │    │   Lua脚本        │    │   限流数据      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│  内存限流器     │ (降级方案)
└─────────────────┘
```

### 前端架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  React组件      │───▶│ 限流状态Hook     │───▶│   API客户端     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  状态显示       │    │  实时更新        │    │   管理界面      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 配置说明

### 环境变量

在 `.env` 文件中添加以下配置：

```bash
# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
REDIS_URL=redis://localhost:6379/0

# 限流配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_NAMESPACE=gpt_invite:rate
```

### 限流策略配置

系统预配置了以下限流策略：

| 策略ID | 描述 | 容量 | 补充率 | 周期 |
|--------|------|------|--------|------|
| `redeem:by_ip` | 兑换码接口（按IP） | 5 | 5/3600 | 1小时 |
| `resend:by_ip` | 重发邀请（按IP） | 3 | 3/3600 | 1小时 |
| `resend:by_email` | 重发邀请（按邮箱） | 2 | 2/3600 | 1小时 |
| `admin:by_ip` | 管理员接口（按IP） | 100 | 100/60 | 1分钟 |

## 部署指南

### 1. Redis部署

#### Docker部署Redis

```bash
# 拉取Redis镜像
docker pull redis:7-alpine

# 运行Redis容器
docker run -d \
  --name redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7-alpine redis-server --appendonly yes
```

#### 使用Docker Compose

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

  app:
    build: ./cloud/backend
    ports:
      - "8000:8000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - RATE_LIMIT_ENABLED=true
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis_data:
```

### 2. 后端部署

```bash
# 安装依赖
pip install redis>=4.5

# 启动应用
cd cloud/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. 前端部署

```bash
# 安装依赖
cd cloud/web
npm install

# 构建前端
npm run build

# 启动前端
npm start
```

## API文档

### 限流状态查询

```http
GET /api/admin/rate-limit/status/{key}
```

**响应示例：**
```json
{
  "key": "ip:redeem:192.168.1.100",
  "remaining": 3,
  "reset_at_ms": 1640995200000,
  "reset_at_seconds": 1640995200,
  "limit": 5,
  "used": 2,
  "usage_percentage": 40.0
}
```

### 限流统计查询

```http
GET /api/admin/rate-limit/stats/{key}
```

**响应示例：**
```json
{
  "key": "ip:redeem:192.168.1.100",
  "allowed": 8,
  "denied": 2,
  "total": 10,
  "success_rate": 80.0,
  "last_allowed_ms": 1640995000000,
  "last_allowed_seconds": 1640995000,
  "last_denied_ms": 1640995100000,
  "last_denied_seconds": 1640995100,
  "remaining": 3,
  "capacity": 5,
  "current_usage": 40.0
}
```

### 更新限流配置

```http
POST /api/admin/rate-limit/config/{config_id}
```

**请求体：**
```json
{
  "capacity": 10,
  "refill_rate": 10.0,
  "expire_seconds": 3600,
  "name": "custom_config"
}
```

### 被拒绝排行榜

```http
GET /api/admin/rate-limit/top-denied?limit=10
```

**响应示例：**
```json
{
  "top_denied": [
    {
      "key": "ip:redeem:192.168.1.100",
      "denied_count": 15,
      "stats_url": "/api/admin/rate-limit/stats/ip:redeem:192.168.1.100"
    }
  ]
}
```

## 前端使用

### 1. 限流状态组件

```tsx
import { RateLimitStatusComponent } from '@/components/rate-limit-status'

// 基本使用
<RateLimitStatusComponent
  key="ip:redeem:192.168.1.100"
  showDetails={true}
/>

// 在兑换表单中使用
import { RedeemFormWithRateLimit } from '@/components/redeem-form-with-rate-limit'

<RedeemFormWithRateLimit />
```

### 2. 管理员仪表板

```tsx
import { AdminRateLimitDashboard } from '@/components/admin-rate-limit-dashboard'

<AdminRateLimitDashboard />
```

### 3. 限流客户端

```typescript
import { rateLimitClient } from '@/lib/distributed-rate-limit'

// 获取限流状态
const status = await rateLimitClient.getStatus('ip:redeem:192.168.1.100')

// 获取统计信息
const stats = await rateLimitClient.getStats('ip:redeem:192.168.1.100')

// 更新配置
await rateLimitClient.updateConfig('redeem:by_ip', {
  capacity: 10,
  refill_rate: 10.0
})
```

## 监控和维护

### 1. 健康检查

```http
GET /api/admin/rate-limit/health
```

### 2. 系统摘要

```http
GET /api/admin/rate-limit/summary
```

### 3. 日志监控

限流器会记录以下日志：
- Redis连接状态
- 降级触发情况
- 配置更新操作
- 统计数据异常

### 4. 性能监控

- Redis内存使用情况
- Lua脚本执行时间
- 限流检查QPS
- 降级频率

## 故障排除

### 常见问题

#### 1. Redis连接失败

**症状：** 限流器降级到内存模式

**解决方案：**
```bash
# 检查Redis服务状态
docker ps | grep redis

# 检查网络连接
telnet redis-host 6379

# 查看应用日志
docker logs app-container
```

#### 2. 限流不生效

**可能原因：**
- `RATE_LIMIT_ENABLED=false`
- Redis连接失败
- 配置错误

**解决方案：**
```bash
# 检查环境变量
echo $RATE_LIMIT_ENABLED

# 检查限流器状态
curl http://localhost:8000/api/admin/rate-limit/health
```

#### 3. 前端显示异常

**可能原因：**
- API接口权限问题
- 网络连接问题
- 数据格式错误

**解决方案：**
- 检查管理员会话状态
- 查看浏览器控制台错误
- 验证API响应格式

### 性能优化

#### 1. Redis优化

```bash
# 启用内存优化
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# 启用持久化
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

#### 2. 应用优化

- 合理设置键过期时间
- 使用连接池
- 监控内存使用

## 安全考虑

1. **Redis安全**
   - 设置密码认证
   - 使用TLS连接
   - 限制网络访问

2. **限流绕过**
   - 使用多种键策略组合
   - 监控异常请求模式
   - 定期审查限流配置

3. **数据隐私**
   - 避免在键中包含敏感信息
   - 定期清理过期数据
   - 限制统计数据访问权限

## 扩展开发

### 添加新的限流策略

1. 在 `rate_limiter_service.py` 中添加配置：

```python
await limiter.set_config("new_strategy:by_ip", RateLimitConfig(
    capacity=20,
    refill_rate=20.0/3600.0,
    expire_seconds=3600,
    name="new_strategy_ip"
))
```

2. 在路由中使用：

```python
from app.utils.utils.rate_limiter.fastapi_integration import rate_limit

@router.post("/new-endpoint")
async def new_endpoint(
    request: Request,
    _: None = Depends(rate_limit(limiter, ip_strategy, config_id="new_strategy:by_ip"))
):
    pass
```

### 自定义键策略

```python
from app.utils.utils.rate_limiter.strategies import KeyStrategy

class CustomKeyStrategy:
    name = "custom"

    def build_key(self, request: Request) -> str:
        # 自定义键生成逻辑
        return f"custom:{your_key_logic}"
```

## 版本历史

- **v2.0.0**: 升级到Redis分布式限流器
  - 支持多实例部署
  - 添加动态配置
  - 提供监控接口
  - 前端集成显示

- **v1.0.0**: 基础内存限流器
  - 简单滑动窗口算法
  - 基础IP限流