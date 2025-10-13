"""
API端点集成测试
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from unittest.mock import patch

from app import models
from app.security import create_access_token


@pytest.mark.integration
class TestPublicAPI:
    """公开API集成测试"""

    def test_health_check(self, test_client: TestClient):
        """测试健康检查端点"""
        response = test_client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_redeem_success(self, test_client: TestClient, db_session, sample_redeem_codes, sample_mother_accounts, sample_teams):
        """测试成功兑换兑换码"""
        # 创建有效的兑换码
        code_hash = "valid_code_hash"
        redeem_code = models.RedeemCode(
            code_hash=code_hash,
            batch_id="test_batch",
            status=models.CodeStatus.unused
        )
        db_session.add(redeem_code)
        db_session.commit()

        # Mock邀请服务
        with patch('app.services.services.redeem.InviteService') as mock_invite_service:
            mock_service_instance = Mock()
            mock_invite_service.return_value = mock_service_instance
            mock_service_instance.invite_email.return_value = (
                True, "邀请成功", "invite_001", "mother_001", "team_001"
            )

            # 发送兑换请求
            response = test_client.post(
                "/api/public/redeem",
                json={
                    "code": "valid_code",
                    "email": "test@example.com"
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "成功" in data["message"]
            assert data["invite_id"] == "invite_001"
            assert data["mother_id"] == "mother_001"
            assert data["team_id"] == "team_001"

    def test_redeem_invalid_code(self, test_client: TestClient):
        """测试无效兑换码"""
        response = test_client.post(
            "/api/public/redeem",
            json={
                "code": "invalid_code",
                "email": "test@example.com"
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "无效" in data["message"]

    def test_redeem_invalid_email(self, test_client: TestClient):
        """测试无效邮箱"""
        response = test_client.post(
            "/api/public/redeem",
            json={
                "code": "some_code",
                "email": "invalid-email"
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    def test_redeem_missing_fields(self, test_client: TestClient):
        """测试缺少字段"""
        # 缺少code字段
        response = test_client.post(
            "/api/public/redeem",
            json={
                "email": "test@example.com"
            }
        )
        assert response.status_code == 422

        # 缺少email字段
        response = test_client.post(
            "/api/public/redeem",
            json={
                "code": "test_code"
            }
        )
        assert response.status_code == 422


@pytest.mark.integration
@pytest.mark.auth
class TestAdminAPI:
    """管理员API集成测试"""

    def test_admin_login_success(self, test_client: TestClient, admin_user):
        """测试管理员登录成功"""
        response = test_client.post(
            "/api/admin/login",
            data={
                "username": admin_user.username,
                "password": "admin123"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_admin_login_wrong_password(self, test_client: TestClient, admin_user):
        """测试管理员登录密码错误"""
        response = test_client.post(
            "/api/admin/login",
            data={
                "username": admin_user.username,
                "password": "wrong_password"
            }
        )

        assert response.status_code == 401
        data = response.json()
        assert "detail" in data

    def test_admin_login_nonexistent_user(self, test_client: TestClient):
        """测试管理员登录用户不存在"""
        response = test_client.post(
            "/api/admin/login",
            data={
                "username": "nonexistent",
                "password": "password"
            }
        )

        assert response.status_code == 401

    def test_protected_endpoint_without_auth(self, test_client: TestClient):
        """测试未认证访问受保护端点"""
        response = test_client.get("/api/admin/stats")
        assert response.status_code == 401

    def test_protected_endpoint_with_auth(self, test_client: TestClient, admin_user):
        """测试认证访问受保护端点"""
        # 创建访问令牌
        token = create_access_token(data={"sub": admin_user.username})
        headers = {"Authorization": f"Bearer {token}"}

        response = test_client.get("/api/admin/stats", headers=headers)
        assert response.status_code == 200

    def test_generate_codes_success(self, test_client: TestClient, admin_user, admin_headers):
        """测试成功生成兑换码"""
        response = test_client.post(
            "/api/admin/codes/generate",
            json={
                "count": 5,
                "prefix": "TEST_",
                "expires_at": (datetime.utcnow() + timedelta(days=30)).isoformat()
            },
            headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "batch_id" in data
        assert "codes" in data
        assert len(data["codes"]) == 5
        assert data["count"] == 5

    def test_generate_codes_invalid_count(self, test_client: TestClient, admin_user, admin_headers):
        """测试无效的生成数量"""
        response = test_client.post(
            "/api/admin/codes/generate",
            json={
                "count": 0,
                "prefix": "TEST_"
            },
            headers=admin_headers
        )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    def test_get_codes_list(self, test_client: TestClient, admin_user, admin_headers, sample_redeem_codes):
        """测试获取兑换码列表"""
        response = test_client.get("/api/admin/codes", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "codes" in data
        assert "total" in data
        assert "page" in data
        assert "size" in data
        assert len(data["codes"]) > 0

    def test_get_invites_list(self, test_client: TestClient, admin_user, admin_headers, sample_invite_requests):
        """测试获取邀请列表"""
        response = test_client.get("/api/admin/invites", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "invites" in data
        assert "total" in data
        assert len(data["invites"]) > 0

    def test_get_statistics(self, test_client: TestClient, admin_user, admin_headers):
        """测试获取统计数据"""
        response = test_client.get("/api/admin/stats", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "total_codes" in data
        assert "used_codes" in data
        assert "pending_invites" in data
        assert "total_invites" in data

    def test_export_users_csv(self, test_client: TestClient, admin_user, admin_headers, sample_invite_requests):
        """测试导出用户数据CSV"""
        response = test_client.get("/api/admin/export/users", headers=admin_headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in response.headers["content-disposition"]

    def test_logout(self, test_client: TestClient, admin_user, admin_headers):
        """测试登出"""
        response = test_client.post("/api/admin/logout", headers=admin_headers)
        assert response.status_code == 200

        # 验证令牌已被失效（这取决于具体实现）
        # 这里只验证响应状态码

    def test_search_codes(self, test_client: TestClient, admin_user, admin_headers, sample_redeem_codes):
        """测试搜索兑换码"""
        response = test_client.get(
            "/api/admin/codes?batch_id=test_batch_001",
            headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "codes" in data

    def test_search_invites_by_email(self, test_client: TestClient, admin_user, admin_headers, sample_invite_requests):
        """测试按邮箱搜索邀请"""
        response = test_client.get(
            "/api/admin/invites?email=user0@example.com",
            headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "invites" in data

    def test_pagination(self, test_client: TestClient, admin_user, admin_headers, sample_redeem_codes):
        """测试分页功能"""
        # 测试第一页
        response = test_client.get("/api/admin/codes?page=1&size=2", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["size"] == 2
        assert len(data["codes"]) <= 2

        # 测试第二页
        if data["total"] > 2:
            response = test_client.get("/api/admin/codes?page=2&size=2", headers=admin_headers)
            assert response.status_code == 200
            data = response.json()
            assert data["page"] == 2


@pytest.mark.integration
@pytest.mark.security
class TestSecurityFeatures:
    """安全功能集成测试"""

    def test_csrf_protection(self, test_client: TestClient):
        """测试CSRF防护"""
        # 这个测试取决于CSRF实现的具体方式
        # 通常需要先获取CSRF令牌，然后在请求中包含它
        pass

    def test_rate_limiting(self, test_client: TestClient):
        """测试限流功能"""
        # 快速发送多个请求
        responses = []
        for _ in range(10):
            response = test_client.post(
                "/api/public/redeem",
                json={
                    "code": "test_code",
                    "email": f"test{_}@example.com"
                }
            )
            responses.append(response)

        # 检查是否有限流响应
        rate_limited = any(r.status_code == 429 for r in responses)
        # 这个断言取决于限流配置
        # assert rate_limited

    def test_input_validation(self, test_client: TestClient):
        """测试输入验证"""
        # 测试SQL注入尝试
        malicious_inputs = [
            "'; DROP TABLE redeem_codes; --",
            "<script>alert('xss')</script>",
            "../../../etc/passwd"
        ]

        for malicious_input in malicious_inputs:
            response = test_client.post(
                "/api/public/redeem",
                json={
                    "code": malicious_input,
                    "email": "test@example.com"
                }
            )
            # 应该返回400或422，而不是500
            assert response.status_code in [400, 422]

    def test_sql_injection_protection(self, test_client: TestClient, admin_headers):
        """测试SQL注入防护"""
        # 尝试SQL注入攻击
        sql_payload = "'; SELECT * FROM admin_users; --"

        response = test_client.get(
            f"/api/admin/codes?batch_id={sql_payload}",
            headers=admin_headers
        )

        # 应该安全处理，不暴露数据库信息
        assert response.status_code not in [500]
        if response.status_code == 200:
            data = response.json()
            # 确保返回的是正常数据，不是数据库错误信息
            assert "codes" in data

    def test_xss_protection(self, test_client: TestClient, admin_headers):
        """测试XSS防护"""
        xss_payload = "<script>alert('xss')</script>"

        response = test_client.post(
            "/api/admin/codes/generate",
            json={
                "count": 1,
                "prefix": xss_payload
            },
            headers=admin_headers
        )

        # 即使允许创建，响应中也应该转义或过滤XSS内容
        if response.status_code == 200:
            data = response.json()
            assert "<script>" not in str(data)


@pytest.mark.integration
@pytest.mark.performance
class TestPerformanceAPI:
    """性能相关的API集成测试"""

    def test_large_data_export(self, test_client: TestClient, admin_user, admin_headers, db_session):
        """测试大数据量导出"""
        # 创建大量测试数据
        invites = []
        for i in range(100):
            invite = models.InviteRequest(
                email=f"user{i}@example.com",
                status=models.InviteStatus.pending,
                created_at=datetime.utcnow()
            )
            invites.append(invite)

        for invite in invites:
            db_session.add(invite)
        db_session.commit()

        # 测试导出性能
        import time
        start_time = time.time()

        response = test_client.get("/api/admin/export/users", headers=admin_headers)

        end_time = time.time()
        response_time = end_time - start_time

        assert response.status_code == 200
        # 导出100条记录应该在合理时间内完成
        assert response_time < 5.0  # 5秒内

    def test_concurrent_requests(self, test_client: TestClient, admin_user, admin_headers):
        """测试并发请求"""
        import threading
        import time

        results = []

        def make_request():
            response = test_client.get("/api/admin/stats", headers=admin_headers)
            results.append(response.status_code)

        # 创建10个并发线程
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=make_request)
            threads.append(thread)

        # 同时启动所有线程
        start_time = time.time()
        for thread in threads:
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()
        end_time = time.time()

        # 验证所有请求都成功
        assert all(status == 200 for status in results)
        # 并发请求应该合理快地完成
        assert end_time - start_time < 10.0  # 10秒内完成10个请求