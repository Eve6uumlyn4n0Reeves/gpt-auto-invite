## 双前端架构方案（Users 前端 / Pool 前端）

### 1. 目标
- Users 业务与 Pool 业务在前端层面彻底隔离，保证构建产物互不影响。
- 仍使用单一对外入口（同一个 Nginx/域名），通过路径或子域映射到不同前端。
- 组件/工具可共享，但需放在明确的 `packages/shared-*` 或 `web/shared` 目录，避免隐式耦合。

### 2. 目录结构（建议）
```
src/web/
  apps/
    users-admin/          # 对应原 admin + public（redeem/switch）等 Users 业务
    pool-admin/           # 对应号池、母号、Pool API 管理
  packages/
    ui/                   # 共享 UI 组件
    hooks/                # 共享 hooks
    api-clients/          # 可选：跨前端共享的 fetch 封装
  shared/                 # 现有 shared/types 可迁至此处
```

### 3. 迁移步骤
1. **复制与瘦身**：将现有 Next.js 应用拆成 `apps/users-admin` 与 `apps/pool-admin` 两个 Next.js 项目（可仍使用 app router）。
2. **路由裁剪**：
   - `users-admin` 保留登录、兑换、Users 管理路由（codes/users/jobs/switch 等）。
   - `pool-admin` 保留号池组、母号、自动录入、Pool API 相关路由。
3. **共享依赖**：将 `components/ui/*` 等通用组件移动到 `packages/ui`，通过 TypeScript references 或 pnpm workspace 引用。
4. **环境变量**：每个前端 APP 有独立的 `.env.example`：
   - Users 前端：`NEXT_PUBLIC_USERS_API_BASE`
   - Pool 前端：`NEXT_PUBLIC_POOL_API_BASE`
   - 仍可支持 SSR 侧自定义。
5. **构建命令**：
   - `pnpm build:users-admin`
   - `pnpm build:pool-admin`
   - 可通过 `pnpm build --filter users-admin` 等 workspace 命令控制。

### 4. Nginx / 反向代理
```
location /admin/ {
    proxy_pass http://users-frontend:3000;
}

location /pool-admin/ {
    proxy_pass http://pool-frontend:3000;
}
```
或者使用子域名：
- `admin.example.com` → Users 前端
- `pool.example.com` → Pool 前端

### 5. 部署策略
- Docker Compose 中增加 `users-frontend` 和 `pool-frontend` 两个服务镜像。
- 前端镜像可以共用同一个 Dockerfile，通过 `ARG APP_NAME` 控制构建目标。
- CI/CD：新增两个 build job，分别部署到静态资源目录或容器。

### 6. 回归测试
- 依照 `docs/architecture/VALIDATION_SUITE.md` 增补前端部分：
  - Users 前端：验证兑换、管理员、批量、队列等页面。
  - Pool 前端：验证母号、号池组、自动录入、Pool API 面板。
- 确保共享组件升级后两个前端都能顺利编译。
- 启用 `pnpm run ci:domain-check`（底层脚本 `scripts/check-domain-imports.cjs`），保证 `domains/**` 与 `store/**` 中不会误用对方域的 API。

