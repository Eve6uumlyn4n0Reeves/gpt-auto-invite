# 快速启动指南

## 前置要求

- Node.js 18+
- Python 3.8+
- Git

## 1. 克隆项目

```bash
git clone <repository-url>
cd cloud
```

## 2. 配置环境变量

创建 `.env.local` 文件：

```bash
# 复制示例文件
cp .env.example .env.local

# 编辑配置
nano .env.local
```

**必需配置**：
```bash
BACKEND_URL=http://localhost:8000
ADMIN_INITIAL_PASSWORD=admin
SECRET_KEY=your-secret-key
ENCRYPTION_KEY=your-encryption-key
```

## 3. 一键启动

```bash
./scripts/start-dev.sh
```

## 4. 访问应用

- 🌐 前端: http://localhost:3000
- 🔧 后端: http://localhost:8000
- 📱 用户兑换: http://localhost:3000/redeem
- ⚙️ 管理后台: http://localhost:3000/admin

## Admin登录

- 地址: http://localhost:3000/admin
- 密码: `admin`（在.env.local中配置）

## 故障排除

### 环境变量检查
```bash
./scripts/check-env.sh
```

### 常见问题

1. **端口被占用** - 更改端口或停止占用进程
2. **权限错误** - 确保脚本有执行权限：`chmod +x scripts/*.sh`
3. **依赖缺失** - 运行 `./scripts/setup.sh`

## 开发说明

- 前端API调用会自动代理到后端
- 所有Admin功能在开发环境正常工作
- 查看浏览器控制台获取API调用日志

详细文档请参考 [DEVELOPMENT.md](./DEVELOPMENT.md)