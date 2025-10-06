# 本地母号录入 GUI（local-gui）

功能概述
- 打开隔离的 `chatgpt.com` 登录窗口（不影响你主浏览器会话）
- 登录母号后获取 `accessToken`
- 直接调用后端管理接口保存母号信息
- 支持从 Cookie 一键导入 Token（无需在小窗中登录）
 - 一键打开云端后台；批量导出/批量上传云端（串行执行）

环境要求
- Python 3.10+
- 依赖安装：`pip install -r requirements.txt`
- 首次安装浏览器内核：`python -m playwright install chromium`

运行
- `python local-gui/main.py`

使用步骤
1. 填写后端地址（默认 `http://localhost:8000`），可点“检查后端”测试可用性。
2. 填写云端地址（默认 `http://localhost:3000`），可点“打开云端后台”直达 `/admin` 页面。
3. 方式A：点击“登录并获取Token”，在打开的 Chromium 窗口中登录 `https://chatgpt.com`，然后回到 GUI 点击“我已登录，获取Token”。
4. 方式B：点击“从Cookie导入Token”，输入管理员密码后粘贴浏览器 Cookie 字符串，GUI 会从后端取回 Token 与过期时间。
5. 填写“母号名称”（自动从邮箱填充，也可手动），按需填写“团队ID（逗号或换行）”，默认取第一项为默认团队。
6. 点击“发送到后端”，GUI 会登录管理员并调用 `/api/admin/mothers` 完成保存。

批量导出（便于 cloud 批量导入）
- 在 GUI 中多次“加入批量”，然后点击“导出批量”。
- 导出格式为纯文本，每行一条：`邮箱---accessToken`。
- 在 cloud 后台“批量导入”视图，粘贴或上传该文本即可解析。

批量上传到云端
- 点击“加入批量”累计条目后，点击“上传到云端”。
- GUI 会以文本（每行 `邮箱---accessToken`）串行上传到云端后端 `POST /api/admin/mothers/batch/import-text`（需要管理员登录）。
- 上传结果会显示成功/总数；失败项可修正后再次上传。

提示
- GUI 使用临时的 Playwright 浏览器上下文，不会污染你的主浏览器。
- 若获取失败，请确认已在弹出窗口登录成功并可访问 `chatgpt.com`。
- 团队可以后续在管理后台修改；也可在此一次性录入多个（逗号或换行分隔）。
