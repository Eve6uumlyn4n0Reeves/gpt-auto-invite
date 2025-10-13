"""
限流键生成策略
"""
from __future__ import annotations

from typing import Protocol, Optional
from fastapi import Request


class KeyStrategy(Protocol):
    """键生成策略协议"""
    name: str

    def build_key(self, request: Request) -> str: ...


class IPKeyStrategy:
    """基于IP的键生成策略"""
    name = "ip"

    def __init__(self, header: Optional[str] = "x-forwarded-for") -> None:
        self.header = header

    def build_key(self, request: Request) -> str:
        if self.header:
            forwarded = request.headers.get(self.header)
            if forwarded:
                # X-Forwarded-For 可能是一个列表
                return forwarded.split(",")[0].strip()
        # 回退到客户端主机地址
        client = request.client.host if request.client else "unknown"
        return client


class PathKeyStrategy:
    """基于路径的键生成策略"""
    name = "path"

    def build_key(self, request: Request) -> str:
        return request.url.path


class EmailKeyStrategy:
    """基于邮箱的键生成策略"""
    name = "email"

    def __init__(self, form_field: str = "email") -> None:
        self.form_field = form_field

    def build_key(self, request: Request) -> str:
        # 在实际使用中，你可能需要更早地解析JSON/表单数据
        # 这里为了简单起见，尝试查询参数
        return request.query_params.get(self.form_field, "unknown")


class CompositeKeyStrategy:
    """
    组合多个策略生成一个键。最终键嵌入每个段，如: "ip:1.2.3.4|path:/login"
    """
    name = "composite"

    def __init__(self, *strategies: KeyStrategy) -> None:
        if not strategies:
            raise ValueError("CompositeKeyStrategy requires at least one strategy")
        self.strategies = strategies

    def build_key(self, request: Request) -> str:
        parts = []
        for s in self.strategies:
            parts.append(f"{s.name}:{s.build_key(request)}")
        return "|".join(parts)


class UserKeyStrategy:
    """基于用户ID的键生成策略"""
    name = "user"

    def build_key(self, request: Request) -> str:
        # 尝试从请求状态中获取用户信息
        user_id = getattr(request.state, 'user_id', None)
        return str(user_id) if user_id else "anonymous"