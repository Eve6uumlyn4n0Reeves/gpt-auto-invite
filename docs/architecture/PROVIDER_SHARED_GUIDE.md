## provider.py 共享准则

1. **定位**：`src/backend/app/provider.py` 是对 ChatGPT 官方 API 的轻量封装，只负责 HTTP 调用、熔断重试、metrics 打点。  
2. **禁止事项**：
   - 不得导入任何 ORM / Session / Repository。
   - 不得依赖 Users / Pool 域模型。
   - 不得维护进程外部状态（例如缓存数据库行）。  
3. **允许事项**：
   - 读取 `settings` 中的 HTTP 代理、默认 TTL 等通用配置。
   - 通过 `provider_metrics` 输出指标。
   - 在函数参数中接受调用侧传入的 token / team_id。
4. **调用方约束**：
   - Users 服务、Pool 服务都可以直接调用 `app.provider` 中的函数。
   - 需要附带领域语义时，应在各自域内定义 Adapter，例如：
     ```python
     # users 服务
     from app import provider

     def issue_user_invite(token: str, team_id: str, email: str):
         return provider.send_invite(token, team_id, email, role="standard-user")
     ```
   - 若将来需要差异化配置（例如不同代理），可在 Adapter 内注入对应的 headers，而不要修改 `provider.py` 本身。
5. **测试建议**：
   - 新增的 provider 函数必须通过 `tests/test_provider_resilience.py`（见下）覆盖；
   - 如果函数需要外部 HTTP mock，请使用 `responses` 或 `respx`。
6. **监控**：
   - 统一使用 `app.metrics.provider_metrics`，Prometheus 标签只使用 `{endpoint, team_id, status}`，以便在多服务之间对齐。

