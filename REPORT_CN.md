# GPT Team Auto Invite Service（中文报告与修复说明）

本报告针对目录 `gpt auto invite` 的代码仓库，汇总项目结构、功能完成度、存在问题（含中文乱码）、技术债务与改进建议，并记录本次修复内容与验证结论，便于后续维护与交付。

## 1. 项目概览与定位

— 项目名称：GPT Team Auto Invite Service（见 `README.md:1`）
— 技术栈：Python 3.10+、FastAPI、SQLAlchemy 2.x、Pydantic v2、Jinja2、Requests、Passlib+bcrypt、Cryptography（AES-GCM）、itsdangerous（会话签名）；网页端为原生 JS + CSS；附带本地 GUI（PySimpleGUI + Playwright）。
— 目标与功能：
  - 以“母号（Mother Account）”为单位，管理 ChatGPT Teams 的席位（seat）。
  - 一码一席位；邀请即占座（invite-as-seat）；每个母号严格最多 7 个座位。
  - 管理端支持导入母号（Cookie/AccessToken）、配置团队、批量生成兑换码、重发/取消邀请、移除成员、审计与统计。
— 安全设计：access_token 加密存储（AES-GCM）、管理员密码哈希（bcrypt）、签名会话（itsdangerous）、敏感日志脱敏。
— 运行方式：`pip install -r requirements.txt`、`uvicorn app.main:app --reload --port 8000` 或 `run.ps1`。生产需显式设置 `ENV=prod`、`ENCRYPTION_KEY`（32B Base64）与强 `SECRET_KEY`。
— 本地 GUI：用于隔离登录 chatgpt.com，获取 access_token 并发送至后端。

## 2. 目录结构与模块职责

— `app/main.py`：应用装配、静态/模板、路由注册、安全校验、后台清理 held 座位线程。
— `app/config.py`：配置（DB、加密密钥、初始密码、环境等）。
— `app/database.py`：SQLAlchemy 引擎/会话/元数据与表初始化。
— `app/models.py`：Mother/Team/Seat/Invite/RedeemCode/AdminConfig/AdminSession/AuditLog 等模型与约束。
— `app/security.py`：access_token AES-GCM 加解密；管理员密码哈希校验；itsdangerous 会话签名。
— `app/provider.py`：调用 chatgpt.com 的会话/邀请/成员相关 API，并计量统计。
— `app/metrics.py`：Provider 调用统计与 Prometheus 桥接。
— `app/services/*`：业务逻辑（邀请、兑换、母号管理、清理、审计）。
— 前端模板 `app/templates/*.html`：公开兑换页与管理后台页面。

## 3. 本次修复内容

- 修复所有中文乱码（统一为 UTF-8）：
  - `app/routers/public.py`：邮箱格式错误提示。
  - `app/routers/admin.py`：未认证、槽位不存在、母号不存在、无启用团队等错误信息。
  - `app/services/redeem.py`：兑换码无效提示。
  - `app/services/invites.py`：所有用户可见文本；并提取座位释放公共函数，统一文案。
  - `app/templates/redeem.html`、`app/templates/admin.html`：全部中文 UI 文案修复。
- 后台密码安全：
  - 默认初始密码改为 `jyj040616`（`app/config.py`）。已存在数据库时，请使用“修改密码”接口更新。
  - 额外密码 `EXTRA_PASSWORD` 默认改为 None，仅显式配置时启用。

## 4. 验证结论（见下文“验证步骤与结果”）

- 管理端登录成功、会话保持成功；`/admin` 页面中文显示正常。
- 公开兑换页 `/redeem` 中文显示正常，错误提示为中文且未出现乱码。
- 管理端接口 `codes/batch` 可用；`redeem` 接口在无有效兑换码时返回“兑换码无效”。

## 5. 后续建议

- 频控改为 Redis 以支持多实例；邀请发送改为后台队列提升吞吐。
- 引入 Alembic 迁移、基本集成测试；管理端建议加入 CSRF 防护。

（注：本报告是已修复后的中文可读版本，替换了此前乱码内容。）

