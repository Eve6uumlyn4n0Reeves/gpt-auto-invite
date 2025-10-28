# 阶段一工作日志：跨库依赖审计

## 背景
目标是彻底拆分 Users / Pool 两条业务链路。当前代码存在大量跨库实体访问，需要逐一梳理并列出整改项。

## 发现的跨库访问点

### 用户链路（Users 会话内访问 Pool 实体）
- 服务层
  - `cloud/backend/app/services/services/invites.py`：`InviteService._choose_target` / `_choose_from_batch` / `invite_email` 查询 `MotherAccount`、`MotherTeam`、`SeatAllocation`；`cancel_invite` / `remove_member` 等操作解密母号 token 并调用号池接口。
  - `cloud/backend/app/services/services/redeem.py`：`redeem_code` 在兑换成功后更新 `MotherAccount`、`SeatAllocation` 状态。
  - `cloud/backend/app/services/services/admin.py`：`create_mother`、`list_mothers_with_usage`、`compute_mother_seats_used` 直接操作池侧实体。
  - 其他服务：`child_account.py`、`maintenance.py`、`team_naming.py` 在 Users 会话中批量读写 Pool 模型（同步子号、清理过期 token、重命名团队）。
- 批处理与后台任务
  - `cloud/backend/app/services/services/jobs.py`：`BatchJob` 保存在 Users 库，但 `pool_sync_mother` 分支需访问 `MotherAccount`、`MotherTeam` 等 Pool 实体。
  - `cloud/backend/app/services/services/maintenance.py`：离线清理任务依赖 Users 会话遍历母号、团队数据。
- 路由层
  - `cloud/backend/app/routers/admin/mothers.py` / `quota.py` / `codes.py` / `stats.py`：统一依赖 `get_db`（Users 会话），却执行池侧查询或更新。
  - `cloud/backend/app/routers/admin/integrations.py`：`mode=pool` 分支串联 Users、Pool 双会话并处理补偿逻辑。
  - 公共路由 `routers/ingest.py`：导入接口在 Users 会话中查找 `MotherAccount`。
- 脚本与测试
  - `cloud/backend/tests` 下的 fixture、集成测试默认单会话覆盖 Users/Pool，后续需拆分。
  - 运维脚本（`scripts/*`）尚需逐个确认是否含跨库访问。

### 前端共用视图
- `cloud/web/components/admin/auto-import-dialog.tsx`：同一组件切换 user / pool 模式，耦合两个后端入口。
- `cloud/web/store/admin` 及其子目录：`MotherAccount`、`PoolGroup`、`UserData` 共用同一上下文与 reducer；`views/mothers-view.tsx`、`sections/mothers-section.tsx` 等页面直接复用用户态状态树。
- API 封装：`cloud/web/lib/api/*` 下的 `adminRequest` 共享 cookies/session，拆分后需按域拆分。

## 建议整改方向（Phase 1 输出）
1. 为跨库访问点建立清单与优先级，为每个函数指定整改 owner。
2. 设计 Users / Pool 仓储接口，明确哪些服务需要重构为跨层调用。
3. 明确迁移期兼容方案（如双写/事件同步），在阶段二实施前完成评估。

## 下一步
- 扩充清单（脚本、测试、指标等遗漏项）。
- 与团队确认整改顺序与时间表，锁定阶段二的首批改造对象。
- 基于 `UsersRepository` / `PoolRepository` 扩展服务重构范围，逐步替换直接 Session 调用。
- 已重构 `resend_invite` / `cancel_invite` / `remove_member`，改用 Users/Pool 仓储并拆分路由依赖。
- 仍待拆分模块：`maintenance.py`（批量清理/同步任务）、`child_account.py`（子号同步）等服务依旧直接使用单 Session。
