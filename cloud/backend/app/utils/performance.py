"""
数据库查询性能监控工具
"""
import time
import logging
from functools import wraps
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import event
from contextlib import contextmanager

# 配置日志
logger = logging.getLogger(__name__)

class QueryMonitor:
    """查询性能监控器"""

    def __init__(self):
        self.query_stats: Dict[str, Dict[str, Any]] = {}
        self.slow_query_threshold = 0.5  # 慢查询阈值（秒）
        self.enabled = True

    def record_query(self, operation: str, duration: float, record_count: int = 0):
        """记录查询统计信息"""
        if not self.enabled:
            return

        if operation not in self.query_stats:
            self.query_stats[operation] = {
                'count': 0,
                'total_time': 0.0,
                'avg_time': 0.0,
                'max_time': 0.0,
                'min_time': float('inf'),
                'total_records': 0,
                'slow_queries': 0
            }

        stats = self.query_stats[operation]
        stats['count'] += 1
        stats['total_time'] += duration
        stats['avg_time'] = stats['total_time'] / stats['count']
        stats['max_time'] = max(stats['max_time'], duration)
        stats['min_time'] = min(stats['min_time'], duration)
        stats['total_records'] += record_count

        if duration > self.slow_query_threshold:
            stats['slow_queries'] += 1
            logger.warning(
                f"Slow query detected: {operation} took {duration:.3f}s "
                f"(threshold: {self.slow_query_threshold}s), records: {record_count}"
            )

        # 记录详细信息
        logger.debug(f"Query executed: {operation} in {duration:.3f}s, records: {record_count}")

    def get_stats(self) -> Dict[str, Dict[str, Any]]:
        """获取统计信息"""
        return self.query_stats.copy()

    def get_slow_queries(self) -> Dict[str, Dict[str, Any]]:
        """获取慢查询统计"""
        return {op: stats for op, stats in self.query_stats.items() if stats['slow_queries'] > 0}

    def reset_stats(self):
        """重置统计信息"""
        self.query_stats.clear()

    def enable(self):
        """启用监控"""
        self.enabled = True

    def disable(self):
        """禁用监控"""
        self.enabled = False

# 全局查询监控器实例
query_monitor = QueryMonitor()

def monitor_query(operation_name: str):
    """装饰器：监控函数的查询性能"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)

                # 尝试从结果中获取记录数量
                record_count = 0
                if hasattr(result, '__len__'):
                    record_count = len(result)
                elif isinstance(result, dict):
                    record_count = 1

                duration = time.time() - start_time
                query_monitor.record_query(operation_name, duration, record_count)

                return result
            except Exception as e:
                duration = time.time() - start_time
                logger.error(f"Query failed: {operation_name} in {duration:.3f}s, error: {str(e)}")
                raise

        return wrapper
    return decorator

@contextmanager
def monitor_session_queries(session: Session, operation_name: str):
    """上下文管理器：监控SQLAlchemy session的查询"""
    if not query_monitor.enabled:
        yield
        return

    queries = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        queries.append({
            'statement': statement,
            'parameters': parameters,
            'start_time': time.time()
        })

    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if queries:
            queries[-1]['end_time'] = time.time()
            queries[-1]['duration'] = queries[-1]['end_time'] - queries[-1]['start_time']
            queries[-1]['rowcount'] = cursor.rowcount if hasattr(cursor, 'rowcount') else 0

    # 注册事件监听器
    event.listen(session.bind, "before_cursor_execute", before_cursor_execute)
    event.listen(session.bind, "after_cursor_execute", after_cursor_execute)

    start_time = time.time()
    total_records = 0

    try:
        yield

        # 计算总时间和记录数
        total_duration = time.time() - start_time
        for query in queries:
            total_records += query.get('rowcount', 0)

        # 记录统计
        query_monitor.record_query(operation_name, total_duration, total_records)

        # 记录详细查询信息（仅在调试模式下）
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"Operation '{operation_name}' executed {len(queries)} queries in {total_duration:.3f}s")
            for i, query in enumerate(queries):
                logger.debug(f"  Query {i+1}: {query['duration']:.3f}s, rows: {query.get('rowcount', 0)}")

    finally:
        # 移除事件监听器
        event.remove(session.bind, "before_cursor_execute", before_cursor_execute)
        event.remove(session.bind, "after_cursor_execute", after_cursor_execute)

def log_performance_summary():
    """记录性能摘要"""
    stats = query_monitor.get_stats()
    if not stats:
        logger.info("No query statistics available")
        return

    logger.info("=== Database Query Performance Summary ===")
    for operation, data in stats.items():
        logger.info(
            f"{operation}: {data['count']} queries, "
            f"avg: {data['avg_time']:.3f}s, "
            f"max: {data['max_time']:.3f}s, "
            f"total: {data['total_time']:.3f}s, "
            f"records: {data['total_records']}, "
            f"slow: {data['slow_queries']}"
        )

    # 记录慢查询详情
    slow_queries = query_monitor.get_slow_queries()
    if slow_queries:
        logger.warning("=== Slow Queries Detected ===")
        for operation, data in slow_queries.items():
            logger.warning(
                f"{operation}: {data['slow_queries']} slow queries, "
                f"max time: {data['max_time']:.3f}s"
            )