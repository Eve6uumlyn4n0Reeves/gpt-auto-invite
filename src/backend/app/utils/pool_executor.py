"""
Pool 并发执行器

提供并发控制和任务执行功能，用于批量操作（踢人、邀请等）。
"""
import asyncio
from typing import Callable, TypeVar, Generic, Any, Optional
from dataclasses import dataclass
from enum import Enum

from ..config import pool_config


T = TypeVar('T')


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


@dataclass
class TaskResult(Generic[T]):
    """任务执行结果"""
    status: TaskStatus
    data: Optional[T] = None
    error: Optional[Exception] = None
    attempt: int = 0
    
    @property
    def is_success(self) -> bool:
        return self.status == TaskStatus.SUCCESS
    
    @property
    def is_failed(self) -> bool:
        return self.status == TaskStatus.FAILED


class ConcurrentExecutor:
    """
    并发执行器
    
    使用 asyncio.Semaphore 控制并发数，支持批量执行任务。
    """
    
    def __init__(self, concurrency: Optional[int] = None):
        """
        初始化执行器
        
        Args:
            concurrency: 并发数，默认从 pool_config 读取
        """
        self.concurrency = concurrency or pool_config.concurrency
        self.semaphore = asyncio.Semaphore(self.concurrency)
    
    async def execute_one(
        self,
        task_fn: Callable[[], T],
        task_id: Any = None,
    ) -> TaskResult[T]:
        """
        执行单个任务（带并发控制）
        
        Args:
            task_fn: 任务函数（同步）
            task_id: 任务标识（用于日志）
            
        Returns:
            TaskResult
        """
        async with self.semaphore:
            try:
                # 在线程池中执行同步函数
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, task_fn)
                return TaskResult(status=TaskStatus.SUCCESS, data=result, attempt=1)
            except Exception as e:
                return TaskResult(status=TaskStatus.FAILED, error=e, attempt=1)
    
    async def execute_many(
        self,
        tasks: list[tuple[Callable[[], T], Any]],
    ) -> list[TaskResult[T]]:
        """
        并发执行多个任务
        
        Args:
            tasks: 任务列表，每个元素为 (task_fn, task_id)
            
        Returns:
            TaskResult 列表（顺序与输入一致）
        """
        coroutines = [
            self.execute_one(task_fn, task_id)
            for task_fn, task_id in tasks
        ]
        return await asyncio.gather(*coroutines)
    
    async def execute_many_simple(
        self,
        task_fns: list[Callable[[], T]],
    ) -> list[TaskResult[T]]:
        """
        并发执行多个任务（简化版，无task_id）
        
        Args:
            task_fns: 任务函数列表
            
        Returns:
            TaskResult 列表（顺序与输入一致）
        """
        tasks = [(fn, i) for i, fn in enumerate(task_fns)]
        return await self.execute_many(tasks)


def run_concurrent(
    task_fns: list[Callable[[], T]],
    concurrency: Optional[int] = None,
) -> list[TaskResult[T]]:
    """
    同步接口：并发执行多个任务
    
    Args:
        task_fns: 任务函数列表
        concurrency: 并发数
        
    Returns:
        TaskResult 列表
    """
    executor = ConcurrentExecutor(concurrency)
    
    # 创建或获取事件循环
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # 没有运行中的循环，创建新的
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(executor.execute_many_simple(task_fns))
        finally:
            loop.close()
    else:
        # 已有运行中的循环，直接使用
        return asyncio.run(executor.execute_many_simple(task_fns))

