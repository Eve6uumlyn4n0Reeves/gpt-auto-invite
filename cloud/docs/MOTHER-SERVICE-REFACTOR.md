# Mother服务层重构指南

## 概述

本文档描述了Mother账号管理模块从直接ORM操作到服务层架构的重构过程。这次重构实现了更好的业务分离、代码复用和测试覆盖率。

## 重构目标

1. **业务分离**：将Pool域（Mother、Team、Seat）与Users域（Invite、Redeem）完全分离
2. **架构清晰**：通过DTO、Repository、Service模式实现清晰的层次结构
3. **易于测试**：提供完整的单元测试和集成测试覆盖
4. **向后兼容**：保持现有API接口不变，内部逐步迁移到新架构

## 架构变更

### 原架构
```
路由 -> 直接ORM操作 -> 数据库
```

### 新架构
```
路由 -> 服务层(Commands/Queries) -> 仓储层 -> 数据库
      -> DTO对象                    -> ORM模型
```

## 新增文件结构

```
cloud/backend/app/
├── domains/
│   └── mother.py                    # Mother相关DTO定义
├── services/services/
│   ├── mother_command.py           # Mother命令服务
│   ├── mother_query.py            # Mother查询服务
│   └── __init__.py                # 服务依赖注入
├── repositories/
│   └── mother_repository.py       # 扩展的Mother仓储
├── routers/admin/
│   └── mothers_new.py            # 使用新服务层的路由
└── tests/
    ├── test_mother_services.py   # 服务层单元测试
    └── test_mother_integration.py # 集成测试
```

## 核心组件

### 1. DTO对象 (domains/mother.py)

```python
# 主要DTO类
- MotherSummary: Mother账号完整摘要
- MotherCreatePayload: 创建请求DTO
- MotherUpdatePayload: 更新请求DTO
- MotherListFilters: 列表查询过滤器
- MotherListResult: 分页查询结果
```

### 2. 命令服务 (services/services/mother_command.py)

负责所有写操作：
- `create_mother()`: 创建Mother账号
- `update_mother()`: 更新Mother账号
- `delete_mother()`: 删除Mother账号
- `assign_to_pool_group()`: 分配到号池组
- `enable_mother() / disable_mother()`: 状态管理

### 3. 查询服务 (services/services/mother_query.py)

负责所有读操作：
- `get_mother()`: 获取单个Mother账号
- `list_mothers()`: 分页列表查询
- `get_quota_metrics()`: 配额统计
- `get_mothers_by_pool_group()`: 按号池组查询

### 4. 仓储层 (repositories/mother_repository.py)

扩展的仓储方法：
- `get_mother_summary()`: 获取完整摘要
- `build_mother_summary()`: 构建DTO对象
- `list_mothers_paginated()`: 支持过滤器的分页查询

## 使用指南

### 在路由中使用新服务层

```python
from app.services.services import MotherServicesDep, MotherCommandServiceDep, MotherQueryServiceDep

@router.post("/mothers")
async def create_mother(
    payload: MotherCreateIn,
    request: Request,
    mother_services: MotherServicesDep,  # 依赖注入
    db_users: Session = Depends(get_db),
):
    # 使用服务层而不是直接ORM操作
    summary = mother_services.command.create_mother(create_payload)
    return mother_summary_to_schema(summary)
```

### 在服务层中组合使用

```python
class MotherServices:
    def __init__(self, command: MotherCommandService, query: MotherQueryService):
        self.command = command
        self.query = query
```

## 迁移策略

### 阶段1：并行运行（当前状态）
- 新旧代码并存
- 新功能使用新架构
- 逐步验证稳定性

### 阶段2：逐步替换
- 替换现有路由到新服务层
- 更新前端调用（如果需要）
- 运行完整的回归测试

### 阶段3：清理旧代码
- 删除旧的直接ORM操作代码
- 清理不再使用的导入和函数
- 更新文档

## 测试策略

### 单元测试
- Mock数据库会话和仓储
- 测试服务层业务逻辑
- 验证DTO转换和验证

### 集成测试
- 使用内存SQLite数据库
- 测试完整的服务栈
- 验证数据库操作和业务规则

### 运行测试

```bash
# 单元测试
python -m pytest tests/test_mother_services.py -v

# 集成测试
python -m pytest tests/test_mother_integration.py -v

# 覆盖率报告
python -m pytest tests/ --cov=app/services/services/mother_*
```

## 性能考虑

### 优化点
1. **N+1查询问题**：在`build_mother_summary`中批量加载关联数据
2. **分页查询**：使用数据库级别的分页而非内存分页
3. **索引优化**：确保过滤字段有适当的数据库索引

### 监控指标
- Mother账号创建/更新/删除的延迟
- 列表查询的响应时间
- 数据库查询执行计划

## 错误处理

### 服务层错误处理原则
1. **业务验证错误**：抛出`ValueError`，包含中文错误消息
2. **数据不存在**：返回`None`（查询）或抛出`ValueError`（命令）
3. **权限错误**：在路由层处理，服务层不关心权限
4. **数据库错误**：向上层传播，由中间件统一处理

### 错误响应格式
```json
{
  "detail": "Mother账号 999 不存在"
}
```

## 安全考虑

### 数据加密
- Access Token在数据库中必须加密存储
- 敏感信息在日志中脱敏处理

### 输入验证
- 所有用户输入通过Pydantic模型验证
- 防止SQL注入和XSS攻击
- 文件名和特殊字符过滤

### 权限控制
- 所有Pool域操作需要`X-Domain: pool`头
- 管理员权限在路由层验证
- CSRF保护对非GET请求强制启用

## 最佳实践

### 代码组织
1. **单一职责**：每个服务类只负责一个领域的操作
2. **依赖注入**：通过构造函数注入依赖，便于测试
3. **接口清晰**：命令和查询服务明确分离

### 命名规范
- DTO类使用`Summary`、`Payload`、`Filters`等后缀
- 服务方法使用动词：`create_`、`update_`、`get_`、`list_`
- 仓储方法使用数据库术语：`get_`、`list_`、`count_`

### 文档维护
- 保持API文档与代码同步
- 更新错误码和消息文档
- 维护架构决策记录（ADR）

## 故障排查

### 常见问题

1. **依赖注入失败**
   - 检查`__init__.py`中的服务注册
   - 确认FastAPI的依赖覆盖配置

2. **DTO序列化错误**
   - 检查Pydantic模型的类型定义
   - 确认`model_config = ConfigDict(from_attributes=True)`

3. **数据库会话错误**
   - 确认使用了正确的数据库会话（Pool vs Users）
   - 检查事务边界和提交时机

### 调试技巧

1. **启用详细日志**
```python
import logging
logging.getLogger('app.services.services.mother_command').setLevel(logging.DEBUG)
```

2. **使用调试断点**
```python
import pdb; pdb.set_trace()
```

3. **检查SQL查询**
```python
from sqlalchemy.dialects import sqlite
print(query.statement.compile(dialect=sqlite.dialect()))
```

## 后续改进

### 短期目标
- [ ] 完成所有Mother相关路由的迁移
- [ ] 添加更多业务规则验证
- [ ] 优化复杂查询的性能

### 长期目标
- [ ] 引入事件驱动架构
- [ ] 实现缓存层
- [ ] 添加业务指标监控

## 相关文档

- [双数据库部署指南](./DUAL-DB.md)
- [号池组配置指南](./POOL-GROUPS.md)
- [阶段二领域模型设计](../refactor/phase2_design.md)
- [ChatGPT API代理请求文档](../ChatGPT_API代理请求文档.md)