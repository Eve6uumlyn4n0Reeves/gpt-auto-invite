"""
测试辅助工具
"""
import json
from typing import Dict, Any, Optional
from datetime import datetime
from fastapi.testclient import TestClient


class APIClient:
    """API客户端封装"""

    def __init__(self, client: TestClient):
        self.client = client
        self.headers = {}

    def set_auth(self, token: str):
        """设置认证令牌"""
        self.headers["Authorization"] = f"Bearer {token}"

    def clear_auth(self):
        """清除认证"""
        self.headers.pop("Authorization", None)

    def post(self, url: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """POST请求"""
        kwargs.setdefault("headers", {}).update(self.headers)
        return self.client.post(url, json=data, **kwargs)

    def get(self, url: str, **kwargs):
        """GET请求"""
        kwargs.setdefault("headers", {}).update(self.headers)
        return self.client.get(url, **kwargs)

    def put(self, url: str, data: Optional[Dict[str, Any]] = None, **kwargs):
        """PUT请求"""
        kwargs.setdefault("headers", {}).update(self.headers)
        return self.client.put(url, json=data, **kwargs)

    def delete(self, url: str, **kwargs):
        """DELETE请求"""
        kwargs.setdefault("headers", {}).update(self.headers)
        return self.client.delete(url, **kwargs)


def assert_valid_response(response, expected_status: int = 200):
    """验证响应格式"""
    assert response.status_code == expected_status, f"Expected {expected_status}, got {response.status_code}"

    # 如果是JSON响应，验证格式
    if response.headers.get("content-type", "").startswith("application/json"):
        data = response.json()
        assert isinstance(data, (dict, list)), "Response should be JSON object or array"

        if isinstance(data, dict) and "error" in data:
            assert "message" in data, "Error response should have message field"


def create_test_payload(**overrides) -> Dict[str, Any]:
    """创建测试载荷"""
    default_payload = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "test"
    }
    default_payload.update(overrides)
    return default_payload


def extract_csrf_token(client: TestClient, login_url: str = "/api/admin/login") -> str:
    """提取CSRF令牌"""
    response = client.get(login_url)
    # 这里需要根据实际的CSRF实现来提取令牌
    # 可能需要从响应头或Cookie中提取
    return "test-csrf-token"  # 临时返回固定值


class DatabaseHelper:
    """数据库操作辅助工具"""

    def __init__(self, db_session):
        self.db = db_session

    def count_records(self, model_class) -> int:
        """计算记录数"""
        return self.db.query(model_class).count()

    def get_record(self, model_class, record_id: int):
        """获取单条记录"""
        return self.db.query(model_class).filter(model_class.id == record_id).first()

    def create_record(self, model_class, **kwargs):
        """创建记录"""
        record = model_class(**kwargs)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def clear_table(self, model_class):
        """清空表"""
        self.db.query(model_class).delete()
        self.db.commit()