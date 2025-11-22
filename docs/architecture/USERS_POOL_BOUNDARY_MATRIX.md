## Users / Pool 业务域矩阵

> 文件目标：快速罗列属于 Users 域与 Pool 域的模块，帮助代码评审确认“某个改动是否越界”。

### Users 域

| 模块类型 | 目录 / 模块 | 说明 |
| --- | --- | --- |
| FastAPI 入口 | `users_app/main.py` | 仅注册 Users 域路由与中间件 |
| 数据库 | `SessionUsers`, `BaseUsers`, `alembic_users/*` | 禁止 Users 代码引用 `SessionPool` |
| 主要路由 | `routers/routers/public.py`, `routers/admin/{codes,users,jobs,switch,bulk_history,quota,performance}` 等 | 若路由需要母号/号池数据，应改由 Pool 服务提供 API |
| 服务层 | `services/services/{invites,redeem,switch,jobs,rate_limiter_service}` | 正在分离中，后续会剥离对 `MotherRepository` 的依赖 |
| 仓储层 | `repositories/UsersRepository` | 仅允许访问 Users 库 |

### Pool 域

| 模块类型 | 目录 / 模块 | 说明 |
| --- | --- | --- |
| FastAPI 入口 | `pool_app/main.py` | 仅注册 Pool 域路由与中间件 |
| 数据库 | `SessionPool`, `BasePool`, `alembic_pool/*` | 禁止 Pool 代码引用 `SessionUsers` |
| 主要路由 | `routers/admin/{mothers,mother_groups,pool_groups,auto_ingest,children}`, `routers/pool_api.py`, `routers/routers/mother_ingest_public.py` | 与母号、号池组相关的所有 API |
| 服务层 | `services/services/{mother_command,mother_group_service,pool_group,pool,team_naming,auto_mother_ingest}` | 只允许访问 Pool 库 |
| 仓储层 | `repositories/mother_repository.py` | 只访问 Pool 库 |

### 禁止跨域的默认白名单

| 名称 | 文件 | 状态 | 说明 |
| --- | --- | --- | --- |
| *(空)* | | | 当前阶段不允许任何跨域协作，如有需求请先设计 API/事件总线，再评审。 |

### 自检脚本

运行 `scripts/check_domain_isolation.py` 可扫描仓库内的 Python 文件，输出“在同一文件中同时导入 Users 与 Pool Session/Repository”的告警列表。若扫描结果非空，说明仍存在跨域代码，需要重构或拆分。

