"""
业务监控和指标收集。

提供业务指标的收集、聚合和导出功能，支持Prometheus等监控系统。
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from functools import wraps
from dataclasses import dataclass
from enum import Enum

try:
    from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

from sqlalchemy.orm import Session
from app.database import get_db_users, get_db_pool


class MetricType(str, Enum):
    """指标类型枚举"""
    COUNTER = "counter"
    HISTOGRAM = "histogram"
    GAUGE = "gauge"


@dataclass
class MetricDefinition:
    """指标定义"""
    name: str
    description: str
    metric_type: MetricType
    labels: List[str] = None

    def __post_init__(self):
        if self.labels is None:
            self.labels = []


class BusinessMetrics:
    """业务指标收集器"""

    def __init__(self, registry: Optional[CollectorRegistry] = None):
        self.registry = registry or CollectorRegistry()
        self._metrics = {}
        self._local_metrics = {}  # 本地存储，用于不支持Prometheus的情况

        # 初始化指标定义
        self._init_metric_definitions()

        # 创建Prometheus指标（如果可用）
        if PROMETHEUS_AVAILABLE:
            self._create_prometheus_metrics()

    def _init_metric_definitions(self):
        """初始化指标定义"""
        self.metric_definitions = {
            # Mother账号相关指标
            "mother_operations_total": MetricDefinition(
                name="mother_operations_total",
                description="Mother账号操作总数",
                metric_type=MetricType.COUNTER,
                labels=["operation", "status"]
            ),
            "mother_operation_duration": MetricDefinition(
                name="mother_operation_duration_seconds",
                description="Mother账号操作耗时",
                metric_type=MetricType.HISTOGRAM,
                labels=["operation"]
            ),
            "mother_active_count": MetricDefinition(
                name="mother_active_count",
                description="活跃Mother账号数量",
                metric_type=MetricType.GAUGE,
                labels=[]
            ),

            # ChildAccount相关指标
            "child_account_operations_total": MetricDefinition(
                name="child_account_operations_total",
                description="子账号操作总数",
                metric_type=MetricType.COUNTER,
                labels=["operation", "status"]
            ),
            "child_account_sync_duration": MetricDefinition(
                name="child_account_sync_duration_seconds",
                description="子账号同步耗时",
                metric_type=MetricType.HISTOGRAM,
                labels=["operation"]
            ),

            # 邀请相关指标
            "invite_operations_total": MetricDefinition(
                name="invite_operations_total",
                description="邀请操作总数",
                metric_type=MetricType.COUNTER,
                labels=["operation", "status"]
            ),
            "invite_success_rate": MetricDefinition(
                name="invite_success_rate",
                description="邀请成功率",
                metric_type=MetricType.GAUGE,
                labels=[]
            ),

            # 批处理作业相关指标
            "batch_job_operations_total": MetricDefinition(
                name="batch_job_operations_total",
                description="批处理作业操作总数",
                metric_type=MetricType.COUNTER,
                labels=["job_type", "status"]
            ),
            "batch_job_duration": MetricDefinition(
                name="batch_job_duration_seconds",
                description="批处理作业执行耗时",
                metric_type=MetricType.HISTOGRAM,
                labels=["job_type"]
            ),
            "batch_job_queue_size": MetricDefinition(
                name="batch_job_queue_size",
                description="批处理作业队列大小",
                metric_type=MetricType.GAUGE,
                labels=["status"]
            ),

            # 数据库连接指标
            "database_connection_pool_active": MetricDefinition(
                name="database_connection_pool_active",
                description="数据库连接池活跃连接数",
                metric_type=MetricType.GAUGE,
                labels=["database"]
            ),
            "database_query_duration": MetricDefinition(
                name="database_query_duration_seconds",
                description="数据库查询耗时",
                metric_type=MetricType.HISTOGRAM,
                labels=["database", "operation"]
            ),

            # API请求指标
            "api_requests_total": MetricDefinition(
                name="api_requests_total",
                description="API请求总数",
                metric_type=MetricType.COUNTER,
                labels=["method", "endpoint", "status"]
            ),
            "api_request_duration": MetricDefinition(
                name="api_request_duration_seconds",
                description="API请求耗时",
                metric_type=MetricType.HISTOGRAM,
                labels=["method", "endpoint"]
            ),
        }

    def _create_prometheus_metrics(self):
        """创建Prometheus指标"""
        if not PROMETHEUS_AVAILABLE:
            return

        for name, definition in self.metric_definitions.items():
            if definition.metric_type == MetricType.COUNTER:
                self._metrics[name] = Counter(
                    name,
                    definition.description,
                    definition.labels,
                    registry=self.registry
                )
            elif definition.metric_type == MetricType.HISTOGRAM:
                self._metrics[name] = Histogram(
                    name,
                    definition.description,
                    definition.labels,
                    registry=self.registry
                )
            elif definition.metric_type == MetricType.GAUGE:
                self._metrics[name] = Gauge(
                    name,
                    definition.description,
                    definition.labels,
                    registry=self.registry
                )

    def increment_counter(self, name: str, labels: Dict[str, str] = None, value: int = 1):
        """增加计数器指标"""
        if name not in self.metric_definitions:
            return

        labels = labels or {}
        metric_key = f"{name}:{tuple(sorted(labels.items()))}"

        if PROMETHEUS_AVAILABLE and name in self._metrics:
            metric = self._metrics[name]
            if hasattr(metric, 'labels'):
                labeled_metric = metric.labels(**labels)
                labeled_metric.inc(value)
            else:
                metric.inc(value)
        else:
            # 本地存储
            if metric_key not in self._local_metrics:
                self._local_metrics[metric_key] = 0
            self._local_metrics[metric_key] += value

    def record_histogram(self, name: str, value: float, labels: Dict[str, str] = None):
        """记录直方图指标"""
        if name not in self.metric_definitions:
            return

        labels = labels or {}

        if PROMETHEUS_AVAILABLE and name in self._metrics:
            metric = self._metrics[name]
            if hasattr(metric, 'labels'):
                labeled_metric = metric.labels(**labels)
                labeled_metric.observe(value)
            else:
                metric.observe(value)
        else:
            # 本地存储
            metric_key = f"{name}:{tuple(sorted(labels.items()))}"
            if metric_key not in self._local_metrics:
                self._local_metrics[metric_key] = []
            self._local_metrics[metric_key].append(value)

    def set_gauge(self, name: str, value: float, labels: Dict[str, str] = None):
        """设置仪表指标"""
        if name not in self.metric_definitions:
            return

        labels = labels or {}
        metric_key = f"{name}:{tuple(sorted(labels.items()))}"

        if PROMETHEUS_AVAILABLE and name in self._metrics:
            metric = self._metrics[name]
            if hasattr(metric, 'labels'):
                labeled_metric = metric.labels(**labels)
                labeled_metric.set(value)
            else:
                metric.set(value)
        else:
            # 本地存储
            self._local_metrics[metric_key] = value

    def get_metrics_text(self) -> str:
        """获取指标文本格式（Prometheus格式）"""
        if PROMETHEUS_AVAILABLE:
            return generate_latest(self.registry).decode('utf-8')
        else:
            # 返回本地指标的简单格式
            lines = []
            for key, value in self._local_metrics.items():
                if isinstance(value, (int, float)):
                    lines.append(f"{key} {value}")
                elif isinstance(value, list):
                    # 简单的统计
                    if value:
                        avg = sum(value) / len(value)
                        lines.append(f"{key}_count {len(value)}")
                        lines.append(f"{key}_sum {sum(value)}")
                        lines.append(f"{key}_avg {avg}")
            return "\n".join(lines)


# 全局指标实例
business_metrics = BusinessMetrics()


def timed(metric_name: str, labels: Dict[str, str] = None):
    """计时装饰器"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                business_metrics.increment_counter(
                    f"{metric_name}_total",
                    {**(labels or {}), "status": "success"}
                )
                return result
            except Exception as e:
                business_metrics.increment_counter(
                    f"{metric_name}_total",
                    {**(labels or {}), "status": "error"}
                )
                raise
            finally:
                duration = time.time() - start_time
                business_metrics.record_histogram(
                    f"{metric_name}_duration",
                    duration,
                    labels
                )

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                business_metrics.increment_counter(
                    f"{metric_name}_total",
                    {**(labels or {}), "status": "success"}
                )
                return result
            except Exception as e:
                business_metrics.increment_counter(
                    f"{metric_name}_total",
                    {**(labels or {}), "status": "error"}
                )
                raise
            finally:
                duration = time.time() - start_time
                business_metrics.record_histogram(
                    f"{metric_name}_duration",
                    duration,
                    labels
                )

        # 根据函数类型返回合适的包装器
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def counted(metric_name: str, labels: Dict[str, str] = None):
    """计数装饰器"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                result = await func(*args, **kwargs)
                business_metrics.increment_counter(
                    metric_name,
                    {**(labels or {}), "status": "success"}
                )
                return result
            except Exception as e:
                business_metrics.increment_counter(
                    metric_name,
                    {**(labels or {}), "status": "error"}
                )
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                business_metrics.increment_counter(
                    metric_name,
                    {**(labels or {}), "status": "success"}
                )
                return result
            except Exception as e:
                business_metrics.increment_counter(
                    metric_name,
                    {**(labels or {}), "status": "error"}
                )
                raise

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


class DatabaseMetricsCollector:
    """数据库指标收集器"""

    def __init__(self):
        self._collect_interval = 60  # 60秒收集一次
        self._last_collection = {}

    def collect_database_metrics(self, users_db: Session, pool_db: Session):
        """收集数据库相关指标"""
        try:
            # Users库指标
            self._collect_users_db_metrics(users_db)

            # Pool库指标
            self._collect_pool_db_metrics(pool_db)

        except Exception as e:
            print(f"收集数据库指标失败: {e}")

    def _collect_users_db_metrics(self, db: Session):
        """收集Users库指标"""
        from app import models

        # 邀请统计
        total_invites = db.query(models.InviteRequest).count()
        pending_invites = db.query(models.InviteRequest).filter(
            models.InviteRequest.status == models.InviteStatus.pending
        ).count()

        business_metrics.set_gauge("invites_total", total_invites)
        business_metrics.set_gauge("invites_pending", pending_invites)

        # 兑换码统计
        total_codes = db.query(models.RedeemCode).count()
        used_codes = db.query(models.RedeemCode).filter(
            models.RedeemCode.status == models.CodeStatus.used
        ).count()

        business_metrics.set_gauge("redeem_codes_total", total_codes)
        business_metrics.set_gauge("redeem_codes_used", used_codes)

        # 批处理作业统计
        total_jobs = db.query(models.BatchJob).count()
        pending_jobs = db.query(models.BatchJob).filter(
            models.BatchJob.status == 'pending'
        ).count()

        business_metrics.set_gauge("batch_jobs_total", total_jobs)
        business_metrics.set_gauge("batch_jobs_pending", pending_jobs)

    def _collect_pool_db_metrics(self, db: Session):
        """收集Pool库指标"""
        from app import models

        # Mother账号统计
        total_mothers = db.query(models.MotherAccount).count()
        active_mothers = db.query(models.MotherAccount).filter(
            models.MotherAccount.status == models.MotherStatus.active
        ).count()

        business_metrics.set_gauge("mother_total", total_mothers)
        business_metrics.set_gauge("mother_active", active_mothers)

        # 子账号统计
        total_children = db.query(models.ChildAccount).count()
        active_children = db.query(models.ChildAccount).filter(
            models.ChildAccount.status == 'active'
        ).count()

        business_metrics.set_gauge("child_accounts_total", total_children)
        business_metrics.set_gauge("child_accounts_active", active_children)

        # 席位统计
        total_seats = db.query(models.SeatAllocation).count()
        used_seats = db.query(models.SeatAllocation).filter(
            models.SeatAllocation.status.in_(['held', 'used'])
        ).count()

        business_metrics.set_gauge("seats_total", total_seats)
        business_metrics.set_gauge("seats_used", used_seats)


class HealthChecker:
    """健康检查器"""

    def __init__(self):
        self.checks = {}

    def register_check(self, name: str, check_func):
        """注册健康检查函数"""
        self.checks[name] = check_func

    def run_checks(self) -> Dict[str, Any]:
        """运行所有健康检查"""
        results = {
            "status": "healthy",
            "checks": {},
            "timestamp": datetime.utcnow().isoformat(),
        }

        for name, check_func in self.checks.items():
            try:
                result = check_func()
                results["checks"][name] = {
                    "status": "healthy" if result else "unhealthy",
                    "message": "OK" if result else "Check failed",
                }
                if not result:
                    results["status"] = "unhealthy"
            except Exception as e:
                results["checks"][name] = {
                    "status": "error",
                    "message": str(e),
                }
                results["status"] = "unhealthy"

        return results


# 全局健康检查器
health_checker = HealthChecker()


# 注册默认健康检查
def database_health_check(users_db: Session, pool_db: Session) -> bool:
    """数据库健康检查"""
    try:
        users_db.execute("SELECT 1").scalar()
        pool_db.execute("SELECT 1").scalar()
        return True
    except Exception:
        return False


def setup_default_health_checks():
    """设置默认健康检查"""
    def db_check():
        from app.database import get_db_users, get_db_pool
        users_db = next(get_db_users())
        pool_db = next(get_db_pool())
        return database_health_check(users_db, pool_db)

    health_checker.register_check("database", db_check)