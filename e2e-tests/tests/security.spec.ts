import { test, expect } from '@playwright/test';

test.describe('安全测试', () => {
  test('CSRF保护', async ({ page }) => {
    await page.goto('/redeem');

    // 尝试跨站请求伪造
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/public/redeem';
      form.innerHTML = `
        <input name="email" value="test@example.com">
        <input name="code" value="TEST-CODE">
      `;
      document.body.appendChild(form);
      form.submit();
    });

    // 等待页面响应
    await page.waitForTimeout(2000);

    // 验证CSRF保护生效
    expect(page.url()).not.toContain('success');
  });

  test('XSS防护', async ({ page }) => {
    await page.goto('/redeem');

    // 尝试注入XSS载荷
    const xssPayload = '<script>alert("XSS")</script>';
    await page.fill('[data-testid="email-input"]', xssPayload);

    // 点击提交
    await page.click('[data-testid="redeem-button"]');

    // 验证脚本未执行
    await page.waitForTimeout(2000);
    await expect(page.locator('text=XSS')).not.toBeVisible();
  });

  test('SQL注入防护', async ({ page }) => {
    await page.goto('/admin');

    // Mock登录
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    await page.reload();

    // 尝试SQL注入
    const sqlPayload = "'; DROP TABLE users; --";
    await page.fill('[data-testid="search-input"]', sqlPayload);
    await page.keyboard.press('Enter');

    // 验证数据库错误未暴露
    await expect(page.locator('text=SQL')).not.toBeVisible();
    await expect(page.locator('text=ORA-')).not.toBeVisible();
    await expect(page.locator('text=MySQL')).not.toBeVisible();
  });

  test('限流保护', async ({ page }) => {
    await page.goto('/redeem');

    // 快速发送多个请求
    for (let i = 0; i < 10; i++) {
      await page.fill('[data-testid="email-input"]`, `test${i}@example.com`);
      await page.click('[data-testid="redeem-button"]');
      await page.waitForTimeout(100);
    }

    // 验证限流生效
    await expect(page.locator('[data-testid="rate-limit-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="rate-limit-error"]')).toContainText('请求过于频繁');
  });

  test('输入验证', async ({ page }) => {
    await page.goto('/redeem');

    // 测试各种恶意输入
    const maliciousInputs = [
      '../../../etc/passwd',
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      '%3Cscript%3Ealert(1)%3C/script%3E',
      '{{7*7}}',
      '${7*7}',
      '<%=7*7%>'
    ];

    for (const input of maliciousInputs) {
      await page.fill('[data-testid="email-input"]', input);
      await page.click('[data-testid="redeem-button"]');

      // 验证恶意输入被拒绝或转义
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    }
  });

  test('会话管理', async ({ page }) => {
    // 访问受保护页面
    await page.goto('/admin');

    // 验证重定向到登录页
    await expect(page).toHaveURL(/.*\/admin\/login/);

    // 执行登录
    await page.fill('[data-testid="username-input"]', 'admin');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');

    // 验证登录成功
    await expect(page).toHaveURL(/.*\/admin/);

    // 验证会话令牌存在
    const token = await page.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    expect(token).toBeTruthy();

    // 清除令牌模拟会话过期
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
    });

    // 访问受保护页面
    await page.goto('/admin/stats');

    // 验证重新重定向到登录页
    await expect(page).toHaveURL(/.*\/admin\/login/);
  });

  test('安全头部', async ({ page }) => {
    const response = await page.goto('/redeem');

    // 验证安全头部存在
    const headers = response!.headers();

    expect(headers['x-frame-options']).toBeTruthy();
    expect(headers['x-content-type-options']).toBeTruthy();
    expect(headers['x-xss-protection']).toBeTruthy();
    expect(headers['strict-transport-security']).toBeTruthy();
  });

  test('HTTPS重定向', async ({ page }) => {
    // 这个测试需要配置HTTPS环境
    if (process.env.TEST_HTTPS === 'true') {
      const response = await page.goto('http://localhost:3000/redeem');
      expect(response!.url()).toMatch(/^https:\/\//);
    }
  });

  test('敏感信息隐藏', async ({ page }) => {
    await page.goto('/admin');

    // Mock登录
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    await page.reload();

    // 检查页面源码不包含敏感信息
    const pageContent = await page.content();
    expect(pageContent).not.toContain('password');
    expect(pageContent).not.toContain('secret');
    expect(pageContent).not.toContain('token');
  });

  test('错误信息安全', async ({ page }) => {
    // 触发应用错误
    await page.route('**/api/public/redeem', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Internal Server Error'
        })
      });
    });

    await page.goto('/redeem');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.click('[data-testid="redeem-button"]');

    // 验证错误消息不暴露敏感信息
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).not.toContain('trace');
    await expect(page.locator('[data-testid="error-message"]')).not.toContain('stack');
    await expect(page.locator('[data-testid="error-message"]')).not.toContain('database');
  });

  test('文件上传安全', async ({ page }) => {
    await page.goto('/admin');

    // Mock登录
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    await page.reload();

    // 尝试上传恶意文件
    const maliciousFile = {
      name: '../../etc/passwd',
      mimeType: 'text/plain',
      buffer: Buffer.from('malicious content')
    };

    // 如果有文件上传功能
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles(maliciousFile);

      // 验证文件类型检查
      await expect(page.locator('[data-testid="file-error"]')).toBeVisible();
    }
  });

  test('API认证测试', async ({ page, request }) => {
    // 尝试无认证访问API
    const response = await request.get('/api/admin/stats');
    expect(response.status()).toBe(401);

    // 尝试无效token访问
    const response2 = await request.get('/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    expect(response2.status()).toBe(401);
  });

  test('并发安全', async ({ page }) => {
    await page.goto('/redeem');

    // 创建多个并发请求
    const promises = Array.from({ length: 5 }, (_, i) =>
      page.evaluate(async (index) => {
        const response = await fetch('/api/public/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: `concurrent${index}@example.com`,
            code: `CODE-${index}`
          })
        });
        return response.status();
      }, i)
    );

    const results = await Promise.all(promises);

    // 验证所有请求都得到正确响应（不是服务器错误）
    results.forEach(status => {
      expect([200, 400, 429]).toContain(status);
      expect(status).not.toBe(500);
    });
  });
});