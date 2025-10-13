# 数据库查询性能优化文档

## 概述

本文档记录了对后端API接口进行的N+1查询优化工作，包括优化策略、实现细节和性能监控工具。

## 优化内容

### 1. 识别的N+1查询问题

#### 1.1 统计接口 (`/api/admin/stats`)
- **问题**: 母账号使用统计中，对每个母账号单独查询座位使用情况
- **原查询次数**: 1 + N (N为母账号数量)
- **优化后**: 2次固定查询

#### 1.2 最近7天活动统计 (`/api/admin/stats`)
- **问题**: 对7天中的每一天单独执行邀请和兑换查询
- **原查询次数**: 14次 (7天 × 2种查询)
- **优化后**: 2次聚合查询

#### 1.3 用户列表接口 (`/api/admin/users`)
- **问题**: 对每个用户单独查询兑换码和团队信息
- **原查询次数**: 1 + 2N (N为用户数量)
- **优化后**: 3次固定查询

#### 1.4 兑换码列表接口 (`/api/admin/codes`)
- **问题**: 对每个兑换码单独查询关联的邀请和团队信息
- **原查询次数**: 1 + 2N (N为兑换码数量)
- **优化后**: 4次固定查询

#### 1.5 导出接口 (`/api/admin/export/*`)
- **问题**: 批量导出时存在严重的N+1查询
- **原查询次数**: 1 + 2N (N为导出记录数)
- **优化后**: 3次固定查询

### 2. 优化策略

#### 2.1 批量查询 (Bulk Loading)
```python
# 优化前
for user in users:
    code = db.query(RedeemCode).filter(RedeemCode.id == user.code_id).first()

# 优化后
code_ids = [u.code_id for u in users if u.code_id]
codes = db.query(RedeemCode).filter(RedeemCode.id.in_(code_ids)).all()
codes_map = {code.id: code for code in codes}
```

#### 2.2 聚合查询 (Aggregation)
```python
# 优化前
for day in range(7):
    daily_count = db.query(InviteRequest).filter(
        InviteRequest.created_at >= start_time,
        InviteRequest.created_at <= end_time
    ).count()

# 优化后
daily_stats = db.query(
    func.date_trunc('day', InviteRequest.created_at).label('date'),
    func.count(InviteRequest.id).label('invites')
).filter(
    or_(*invite_conditions)
).group_by(
    func.date_trunc('day', InviteRequest.created_at)
).all()
```

#### 2.3 JOIN查询优化
```python
# 使用JOIN减少查询次数
free_seats = (
    db.query(SeatAllocation)
    .join(MotherAccount, SeatAllocation.mother_id == MotherAccount.id)
    .filter(
        MotherAccount.status == MotherStatus.active,
        SeatAllocation.status == SeatStatus.free,
        team_exists,
    )
    .count()
)
```

### 3. 性能监控工具

#### 3.1 查询监控器 (`app.utils.performance`)

提供了完整的查询性能监控功能：

```python
from app.utils.performance import monitor_session_queries

# 监控整个接口的数据库查询
@router.get("/stats")
def stats(request: Request, db: Session = Depends(get_db)):
    with monitor_session_queries(db, "admin_stats"):
        # 所有数据库查询
        ...
```

#### 3.2 监控功能

- **查询时间统计**: 记录每个操作的总时间、平均时间、最大/最小时间
- **慢查询检测**: 自动识别超过阈值的查询（默认500ms）
- **查询计数**: 统计查询次数和返回记录数
- **详细日志**: 提供调试级别的详细查询信息

#### 3.3 性能监控接口

新增了三个管理接口用于性能监控：

```bash
# 获取性能统计
GET /api/admin/performance/stats

# 重置性能统计
POST /api/admin/performance/reset

# 开启/关闭性能监控
POST /api/admin/performance/toggle
```

### 4. 预期性能提升

#### 4.1 查询次数减少
- **统计接口**: 查询次数减少 > 60%
- **用户列表**: 查询次数减少 > 80%
- **兑换码列表**: 查询次数减少 > 75%
- **导出接口**: 查询次数减少 > 85%

#### 4.2 响应时间目标
- **统计接口**: < 500ms (95%分位)
- **列表接口**: < 300ms (95%分位)
- **导出接口**: < 1000ms (95%分位)

### 5. 使用方法

#### 5.1 启用性能监控

性能监控默认启用，可通过接口控制：

```bash
# 查看当前状态
curl -X GET "http://localhost:8000/api/admin/performance/stats" \
  -H "Cookie: admin_session=your_session"

# 关闭监控
curl -X POST "http://localhost:8000/api/admin/performance/toggle" \
  -H "Cookie: admin_session=your_session"
```

#### 5.2 查看性能报告

性能监控会自动记录到日志中：

```bash
# 查看性能摘要
tail -f logs/app.log | grep "Performance Summary"

# 查看慢查询
tail -f logs/app.log | grep "Slow query"
```

#### 5.3 运行性能测试

```bash
cd cloud/backend
python test_performance.py
```

### 6. 优化效果验证

#### 6.1 关键指标

| 接口 | 优化前查询数 | 优化后查询数 | 减少比例 | 目标响应时间 |
|------|-------------|-------------|----------|-------------|
| /stats | 15-25+ | 8-10 | >60% | <500ms |
| /users | 1+2N | 3 | >80% | <300ms |
| /codes | 1+2N | 4 | >75% | <400ms |
| /export/* | 1+2N | 3 | >85% | <1000ms |

#### 6.2 监控指标

- **查询次数**: 每个接口的数据库查询总数
- **平均响应时间**: 接口响应时间的95%分位
- **慢查询率**: 超过500ms的查询比例
- **数据库负载**: 整体数据库查询负载

### 7. 最佳实践

#### 7.1 查询优化原则

1. **优先使用聚合查询**：减少循环查询
2. **批量加载关联数据**：使用 `IN` 查询代替循环查询
3. **合理使用JOIN**：在需要关联查询时使用JOIN
4. **添加适当索引**：确保查询字段有合适的索引
5. **监控查询性能**：定期检查慢查询

#### 7.2 代码模式

```python
# 推荐的优化模式
def optimized_query(db):
    # 1. 获取主数据
    main_items = db.query(MainModel).all()

    if not main_items:
        return []

    # 2. 收集关联ID
    related_ids = [item.related_id for item in main_items if item.related_id]

    # 3. 批量查询关联数据
    related_map = {}
    if related_ids:
        related_items = db.query(RelatedModel).filter(
            RelatedModel.id.in_(related_ids)
        ).all()
        related_map = {item.id: item for item in related_items}

    # 4. 组装结果
    result = []
    for item in main_items:
        related_data = related_map.get(item.related_id)
        result.append(build_result(item, related_data))

    return result
```

### 8. 故障排除

#### 8.1 常见问题

1. **内存使用增加**: 批量查询可能导致内存使用增加
   - 解决方案：对大数据集使用分页查询

2. **查询超时**: 复杂的聚合查询可能导致超时
   - 解决方案：添加查询超时设置和索引优化

3. **监控性能影响**: 性能监控本身可能影响性能
   - 解决方案：在生产环境中可选择性关闭监控

#### 8.2 调试方法

```python
# 启用详细日志
import logging
logging.getLogger('app.utils.performance').setLevel(logging.DEBUG)

# 查看SQL查询日志
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

### 9. 后续优化建议

1. **缓存策略**: 对频繁查询的静态数据添加缓存
2. **数据库连接池**: 优化数据库连接池配置
3. **读写分离**: 考虑使用读写分离架构
4. **索引优化**: 根据实际查询模式优化索引
5. **定期分析**: 定期分析查询性能和数据增长情况

---

## 总结

通过本次N+1查询优化，显著提升了后端API的查询性能，减少了数据库负载，并建立了完善的性能监控体系。建议在生产环境中持续监控查询性能，并根据实际使用情况进行进一步优化。