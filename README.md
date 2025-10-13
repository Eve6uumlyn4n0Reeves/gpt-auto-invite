# ChatGPT 团队邀请管理系统

一个完整的 ChatGPT 母号与团队邀请管理解决方案，包含后端服务、管理后台和本地录入工具。

## 🌟 功能特性

### 🏢 母号与席位管理
- 每个母号固定 7 个席位
- 智能座位分配：先填满一个母号再切换，优先早录入的母号
- 同一邮箱可加入多个团队（仅限制同一 team 不重复）
- 母号状态监控与自动失效处理

### 🎫 兑换码系统
- 兑换额度恒等：活跃且"有启用团队"的空位 − 未过期未使用码
- 批量生成、复制、TXT/CSV 导出
- 兑换码状态总览，展示码-邮箱-母号-团队映射关系
- 防并发控制与座位占用保护

### 📊 数据管理
- 支持批量导入：JSON/JSONL 文件与纯文本粘贴
- 导入前预览与校验，支持修改 team 信息
- 批量操作：禁用未使用码、重发/取消邀请、移除成员

### 🖥️ 管理后台
- 实时数据看板与可视化图表
- 母号使用率监控
- 邀请记录与状态跟踪
- 响应式设计，支持移动端

### 🛠️ 本地工具
- 隔离的 ChatGPT 登录窗口
- 自动获取 accessToken
- Cookie 一键导入功能
- 批量导出/上传云端功能

## 📁 项目结构

```
├── cloud/                   # 云端模块
│   ├── backend/            # FastAPI 后端服务
│   │   ├── app/
│   │   │   ├── main.py     # 应用入口
│   │   │   ├── routers/    # 路由模块
│   │   │   ├── services/   # 业务逻辑
│   │   │   ├── models/     # 数据模型
│   │   │   └── utils/      # 工具函数
│   │   ├── Dockerfile.backend
│   │   └── requirements.txt
│   ├── web/                # Next.js 管理后台
│   │   ├── app/
│   │   │   ├── admin/      # 管理页面
│   │   │   ├── redeem/     # 兑换页面
│   │   │   └── api/        # API 路由
│   │   ├── components/     # React 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── store/          # 状态管理
│   │   ├── Dockerfile.frontend
│   │   └── package.json
│   ├── scripts/            # 部署和管理脚本
│   └── docker-compose.yml  # Docker 编排文件
├── local-gui/              # 本地录入工具
│   ├── main.py            # GUI 应用入口
│   └── requirements.txt
└── docs/                  # 文档目录
    ├── API.md             # API 文档
    ├── DEPLOYMENT.md      # 部署指南
    ├── DEVELOPMENT.md     # 开发指南
    └── TROUBLESHOOTING.md # 故障排除
```

## 🚀 快速开始

### 环境要求

- **后端**: Python 3.10+
- **前端**: Node.js 18+, pnpm 10+
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **Docker**: Docker & Docker Compose (可选)

### 本地开发

#### 1. 克隆项目
```bash
git clone <repository-url>
cd "gpt invite"
```

#### 2. 启动后端服务
```bash
cd cloud/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 3. 启动前端服务
```bash
cd cloud/web
pnpm install
pnpm dev
```

#### 4. 配置环境变量
在 `cloud` 目录创建 `.env` 文件：
```env
# 数据库配置
DATABASE_URL=sqlite:///./data/app.db

# 管理员配置
ADMIN_INITIAL_PASSWORD=your_secure_password
SECRET_KEY=your_secret_key
ENCRYPTION_KEY=your_encryption_key

# 邮件配置 (可选)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Docker 部署

```bash
cd cloud
docker-compose up -d
```

### 使用本地录入工具

```bash
cd local-gui
pip install -r requirements.txt
python -m playwright install chromium
python main.py
```

## 📖 文档

- [开发指南](./docs/DEVELOPMENT.md) - 详细的开发环境搭建和开发流程
- [配置教程](./docs/CONFIGURATION.md) - 环境变量说明（开发/生产）与示例
- [API 文档](./docs/API.md) - 完整的 API 接口文档
- [部署指南](./docs/DEPLOYMENT.md) - 生产环境部署说明
- [故障排除](./docs/TROUBLESHOOTING.md) - 常见问题解决方案

## 🎯 核心业务规则

### 座位分配算法
1. 按母号 `created_at` 升序遍历
2. 优先选择有空位的母号
3. 同母号内按 `slot_index` 从小到大使用
4. 仅考虑活跃且有启用团队的母号

### 兑换码生成规则
```
可生成数量 = 活跃且有启用团队的空位数 - 未过期且未使用的兑换码数量
```

### 邮箱复用规则
- 允许同一邮箱加入不同团队
- 唯一约束：`(team_id, email)` 组合不能重复

### 并发控制
- 兑换码状态流转：`unused -> blocked -> used`
- 座位占用：`held` (30秒超时) -> `used`
- 使用行级锁防止并发冲突

## 🔧 技术栈

### 后端
- **框架**: FastAPI 0.104+
- **数据库**: SQLite / PostgreSQL 15+
- **ORM**: SQLAlchemy 2.0+
- **认证**: JWT Token
- **加密**: AES-256-GCM

### 前端
- **框架**: Next.js 14 (App Router)
- **UI**: Tailwind CSS + Radix UI
- **状态管理**: Redux Toolkit
- **图表**: Recharts
- **类型检查**: TypeScript 5+

### 基础设施
- **容器化**: Docker & Docker Compose
- **反向代理**: Nginx
- **进程管理**: PM2
- **监控**: 内置健康检查

## 📊 系统架构

```mermaid
graph TB
    A[用户] --> B[Nginx 反向代理]
    B --> C[Next.js 前端]
    B --> D[FastAPI 后端]
    D --> E[PostgreSQL/SQLite 数据库]
    F[本地 GUI 工具] --> D
    D --> G[邮件服务]

    subgraph "管理后台"
        C --> H[React 组件]
        C --> I[状态管理]
    end

    subgraph "后端服务"
        D --> J[API 路由]
        D --> K[业务逻辑层]
        D --> L[数据访问层]
    end
```

## 🔐 安全特性

- ✅ JWT 身份认证
- ✅ API 接口权限控制
- ✅ 敏感数据加密存储
- ✅ SQL 注入防护
- ✅ XSS 攻击防护
- ✅ CSRF 保护
- ✅ 输入数据验证与清理

## 📈 性能优化

- ✅ 数据库查询优化与索引
- ✅ 分页查询减少数据传输
- ✅ 前端组件懒加载
- ✅ 静态资源缓存
- ✅ API 响应缓存
- ✅ 数据库连接池

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有疑问，请：

1. 查看 [故障排除指南](./docs/TROUBLESHOOTING.md)
2. 搜索现有的 [Issues](../../issues)
3. 创建新的 Issue 描述问题

## 🔄 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新信息。

---

> 💡 **提示**: 首次使用时，建议先阅读 [开发指南](./docs/DEVELOPMENT.md) 了解完整的开发流程。
