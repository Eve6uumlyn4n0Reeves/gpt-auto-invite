# 限流器升级指南

## 升级概述

本文档描述了从内存限流器升级到Redis分布式限流器的详细步骤。

## 升级前后对比

### 升级前 (v1.0)
- **限流类型**: 单机内存限流
- **算法**: 滑动窗口
- **多实例支持**: ❌
- **动态配置**: ❌
- **统计监控**: ❌
- **降级机制**: ❌

### 升级后 (v2.0)
- **限流类型**: Redis分布式限流
- **算法**: 令牌桶
- **多实例支持**: ✅
- **动态配置**: ✅
- **统计监控**: ✅
- **降级机制**: ✅

## 升级步骤

### 1. 环境准备

#### 1.1 安装Redis
```bash
# 使用Docker
docker run -d \
  --name redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7-alpine redis-server --appendonly yes

# 或使用包管理器
sudo apt-get install redis-server  # Ubuntu/Debian
brew install redis                  # macOS
```

#### 1.2 更新Python依赖
```bash
cd cloud/backend
pip install redis>=4.5
```

#### 1.3 更新环境变量
```bash
# 在 .env 文件中添加
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password  # 可选
REDIS_DB=0
RATE_LIMIT_ENABLED=true
RATE_LIMIT_NAMESPACE=gpt_invite:rate
```

### 2. 代码部署

#### 2.1 后端部署
```bash
# 部署新的限流器模块
cp -r app/utils/utils/rate_limiter/ app/utils/utils/

# 更新服务文件
cp app/services/services/rate_limiter_service.py app/services/services/

# 更新路由
cp app/routers/routers/rate_limit.py app/routers/routers/

# 更新主应用
cp app/main.py app/main.py.backup  # 备份
# 然后更新 main.py 添加限流器初始化
```

#### 2.2 前端部署
```bash
# 部署新的前端组件
cp components/rate-limit-status.tsx components/
cp components/admin-rate-limit-dashboard.tsx components/
cp components/redeem-form-with-rate-limit.tsx components/

# 部署新的客户端库
cp lib/distributed-rate-limit.ts lib/
```

### 3. 使用自动化脚本

#### 3.1 完整部署
```bash
cd cloud/scripts
./setup-rate-limiting.sh
```

#### 3.2 功能测试
```bash
cd cloud/scripts
./test-rate-limiting.sh
```

## 配置迁移

### 旧配置处理（历史参考，勿在新代码中使用）

原有的内存限流器配置：
```python
# 旧配置 (已废弃，仅作迁移对照，生产环境请使用 Redis 分布式限流器)
redeem_rl = SimpleRateLimiter(max_events=60, per_seconds=60)
resend_rl = SimpleRateLimiter(max_events=10, per_seconds=60)
```

### 新配置设置

新的Redis限流器配置：
```python
# 新配置 (自动设置)
await limiter.set_config("redeem:by_ip", RateLimitConfig(
    capacity=5,
    refill_rate=5.0/3600.0,  # 每小时5次
    expire_seconds=3600,
    name="redeem_ip"
))

await limiter.set_config("resend:by_ip", RateLimitConfig(
    capacity=3,
    refill_rate=3.0/3600.0,  # 每小时3次
    expire_seconds=3600,
    name="resend_ip"
))
```

## API变更

### 响应头变化

升级后，API响应将包含以下标准限流头：
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1640995200
Retry-After: 300  # 仅在429响应时
```

### 错误响应格式

限流触发时的错误响应：
```json
{
  "detail": "请求过于频繁，请稍后重试"
}
```

## 前端集成

### 1. 组件替换

#### 旧组件
```tsx
// 旧的兑换表单
<RedeemFormEnhanced />
```

#### 新组件
```tsx
// 新的带限流显示的兑换表单
<RedeemFormWithRateLimit />
```

### 2. 限流状态显示

```tsx
import { RateLimitStatusComponent } from '@/components/rate-limit-status'

// 显示特定键的限流状态
<RateLimitStatusComponent
  key="ip:redeem:192.168.1.100"
  showDetails={true}
/>
```

### 3. 管理界面

```tsx
import { AdminRateLimitDashboard } from '@/components/admin-rate-limit-dashboard'

// 管理员限流仪表板
<AdminRateLimitDashboard />
```

## 监控和维护

### 1. 健康检查

```bash
# 检查限流器状态
curl http://localhost:8000/api/admin/rate-limit/health

# 检查系统摘要
curl http://localhost:8000/api/admin/rate-limit/summary
```

### 2. 性能监控

#### Redis监控
```bash
# Redis内存使用
docker exec redis redis-cli info memory | grep used_memory

# Redis连接数
docker exec redis redis-cli info clients

# Redis慢查询
docker exec redis redis-cli slowlog get 10
```

#### 应用监控
```bash
# 查看应用日志
docker logs app-container

# 监控限流QPS
curl -s http://localhost:8000/api/admin/rate-limit/stats/ip:redeem:127.0.0.1 | jq '.total'
```

### 3. 配置管理

#### 查看当前配置
```bash
curl http://localhost:8000/api/admin/rate-limit/config
```

#### 更新配置
```bash
curl -X POST http://localhost:8000/api/admin/rate-limit/config/redeem:by_ip \
  -H "Content-Type: application/json" \
  -d '{
    "capacity": 10,
    "refill_rate": 10.0,
    "expire_seconds": 3600,
    "name": "updated_redeem_config"
  }'
```

## 故障排除

### 1. Redis连接问题

#### 症状
- 限流器降级到内存模式
- 日志显示Redis连接失败

#### 解决方案
```bash
# 检查Redis状态
docker ps | grep redis

# 检查网络连接
telnet localhost 6379

# 检查Redis配置
docker exec redis redis-cli config get "*"

# 重启Redis
docker restart redis
```

### 2. 限流不生效

#### 症状
- 请求未被限制
- 限流状态显示异常

#### 解决方案
```bash
# 检查限流器状态
curl http://localhost:8000/api/admin/rate-limit/health

# 检查环境变量
echo $RATE_LIMIT_ENABLED

# 重启应用
docker restart app-container
```

### 3. 性能问题

#### 症状
- 响应时间增加
- Redis内存使用过高

#### 解决方案
```bash
# 优化Redis配置
docker exec redis redis-cli config set maxmemory-policy allkeys-lru

# 监控Redis性能
docker exec redis redis-cli info stats

# 清理过期数据
docker exec redis redis-cli --scan --pattern "*rate:*" | xargs docker exec redis redis-cli del
```

## 回滚计划

如果升级出现问题，可以按以下步骤回滚：

### 1. 停止新服务
```bash
docker-compose -f docker-compose.rate-limit.yml down
```

### 2. 恢复旧配置
```bash
# 恢复环境变量
git checkout .env

# 恢复代码
git checkout HEAD~1 -- app/main.py
git checkout HEAD~1 -- app/routers/routers/public.py
git checkout HEAD~1 -- app/routers/admin/__init__.py
git checkout HEAD~1 -- app/routers/admin/*.py
```

### 3. 重启旧服务
```bash
cd cloud/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 升级验证清单

- [ ] Redis服务正常运行
- [ ] 应用启动无错误
- [ ] 限流器健康检查通过
- [ ] 兑换接口限流正常
- [ ] 重发接口限流正常
- [ ] 管理员接口限流正常
- [ ] 前端限流状态显示正常
- [ ] 管理界面功能正常
- [ ] 监控指标正常
- [ ] 性能无明显下降

## 最佳实践

### 1. 生产环境建议

- Redis集群部署，提高可用性
- 定期备份Redis数据
- 监控Redis内存使用
- 设置合理的过期时间

### 2. 安全建议

- Redis启用密码认证
- 使用TLS连接
- 限制Redis网络访问
- 定期更新限流配置

### 3. 性能优化

- 合理设置令牌桶大小
- 使用连接池
- 监控关键指标
- 定期清理过期数据

## 技术支持

如果在升级过程中遇到问题，请：

1. 查看详细日志
2. 运行测试脚本验证
3. 检查配置文件
4. 参考故障排除指南
5. 联系技术支持

---

**注意**: 升级过程中建议在测试环境先行验证，确认无误后再在生产环境部署。
