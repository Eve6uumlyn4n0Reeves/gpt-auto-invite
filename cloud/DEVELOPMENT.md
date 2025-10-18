# 开发环境配置指南

## 概述

本文档描述了如何配置和运行开发环境，特别关注Admin功能的API调用问题。

## 项目架构

```
cloud/
├── backend/          # FastAPI 后端服务
│   └── app/
├── web/             # Next.js 前端应用
│   ├── app/
│   │   ├── api/     # API路由（用于生产环境）
│   │   └── admin/   # Admin页面
│   └── hooks/       # React Hooks
└── scripts/         # 部署和开发脚本
```

## 环境变量配置

### 必需的环境变量

创建 `.env.local` 文件（在 `cloud/` 目录下），更多细节参见 `docs/CONFIGURATION.md`：

```bash
# 后端服务URL（开发环境）
BACKEND_URL=http://localhost:8000

# 开发环境标识
NODE_ENV=development

# Admin初始密码
ADMIN_INITIAL_PASSWORD=admin123

# 安全密钥（生产环境必须更改）
SECRET_KEY=your-secret-key-here

# 加密密钥（32字节base64）
# 生成命令: openssl rand -base64 32
ENCRYPTION_KEY=your-encryption-key-here
```

### 可选的环境变量

```bash
# 数据库连接（可选）
# 未设置时后端默认使用绝对路径 cloud/backend/data/app.db
# DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname

# SMTP配置（邮件发送）
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password

# 速率限制配置
# RATE_LIMIT_REQUESTS=10
# RATE_LIMIT_WINDOW=60
```

## 启动开发环境

### 1. 自动启动（推荐）

```bash
cd cloud
./scripts/start-dev.sh
```

这个脚本会：
- 检查环境变量
- 启动后端服务（端口8000）
- 设置BACKEND_URL环境变量
- 启动前端服务（端口3000）

### 2. 手动启动

如果需要手动启动服务：

```bash
# 启动后端
cd cloud/backend
uvicorn app.main:app --reload --port 8000

# 在新终端中启动前端
cd cloud/web
BACKEND_URL=http://localhost:8000 NODE_ENV=development npm run dev
```

## API调用架构

### 开发环境

开发环境使用Next.js的代理功能：

1. **前端请求** → `/api/admin/*`
2. **Next.js代理** → `http://localhost:8000/api/admin/*`
3. **后端处理** → 返回响应

### 生产环境

生产环境使用API路由文件：

1. **前端请求** → `/api/admin/*`
2. **Next.js路由** → `/app/api/admin/[...path]/route.ts`
3. **代理到后端** → 返回响应

## Admin功能配置

### API调用Hook

Admin功能使用 `useAdminSimple` Hook，它会：

- 自动处理环境变量
- 在客户端使用相对路径
- 添加调试日志
- 统一错误处理

### 环境变量支持

Hook内部使用 `getApiBaseUrl()` 函数：

```typescript
const getApiBaseUrl = () => {
  // 客户端：使用相对路径让Next.js处理代理
  if (typeof window !== 'undefined') {
    return ''
  }
  // 服务端：直接使用后端URL
  return process.env.BACKEND_URL || 'http://localhost:8000'
}
```

## 常见问题

### 1. Admin功能无法工作

**问题**：前端无法调用Admin API
**解决方案**：
- 检查环境变量是否正确设置
- 确认后端服务正在运行
- 查看浏览器控制台的API调用日志

### 2. CORS错误

**问题**：跨域请求被阻止
**解决方案**：
- 确保使用 `start-dev.sh` 脚本启动
- 检查 `BACKEND_URL` 环境变量
- 验证Next.js代理配置

### 3. 环境变量未生效

**问题**：环境变量配置后仍然报错
**解决方案**：
- 重启开发服务器
- 检查 `.env.local` 文件位置
- 运行环境变量检查脚本：

```bash
cd cloud
./scripts/check-env.sh
```

## 调试技巧

### 1. API调用日志

Admin Hook会自动打印API调用日志：

```
[Admin API] GET /api/admin/me
[Admin API] POST /api/admin/login
```

### 2. 网络检查

在浏览器开发者工具的Network标签页中：
- 查看API请求URL
- 检查请求头和响应头
- 验证响应状态码

### 3. 后端日志

查看后端服务日志：

```bash
# 查看后端控制台输出
# 检查是否有API请求到达后端
```

## 部署注意事项

### 生产环境配置

1. **环境变量**：确保所有必需变量已设置
2. **安全配置**：更改默认密码和密钥
3. **HTTPS**：使用HTTPS协议
4. **数据库**：配置生产数据库

### 构建和部署

```bash
# 构建前端
cd cloud/web
npm run build

# 启动生产服务器
npm start
```

## 文件结构

### 新增的API路由文件

- `/app/api/admin/[...path]/route.ts` - 通用Admin API代理
- `/app/api/admin/me/route.ts` - Admin认证检查
- `/app/api/admin/login/route.ts` - Admin登录
- `/app/api/admin/logout/route.ts` - Admin登出

### 修改的配置文件

- `/hooks/use-admin-simple.ts` - 添加环境变量支持
- `/scripts/start-dev.sh` - 注入环境变量
- `/next.config.mjs` - 优化代理配置

## 支持

如果遇到问题：

1. 检查环境变量配置
2. 查看控制台日志
3. 验证服务状态
4. 参考本文档的调试技巧
