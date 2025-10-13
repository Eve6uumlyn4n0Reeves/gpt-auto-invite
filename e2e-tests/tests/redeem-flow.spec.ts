import { test, expect } from '@playwright/test';

test.describe('兑换流程', () => {
  test.beforeEach(async ({ page }) => {
    // 访问兑换页面
    await page.goto('/redeem');
  });

  test('用户可以成功兑换邀请', async ({ page }) => {
    // 填写有效邮箱
    await page.fill('[data-testid="email-input"]', 'test@example.com');

    // 填写兑换码（如果有）
    const codeInput = page.locator('[data-testid="code-input"]');
    if (await codeInput.isVisible()) {
      await codeInput.fill('VALID-CODE-123');
    }

    // 点击兑换按钮
    await page.click('[data-testid="redeem-button"]');

    // 验证成功消息
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('兑换成功');

    // 验证页面重定向或状态更新
    await expect(page).toHaveURL(/.*\/redeem/);
  });

  test('显示无效邮箱错误', async ({ page }) => {
    // 填写无效邮箱
    await page.fill('[data-testid="email-input"]', 'invalid-email');

    // 点击兑换按钮
    await page.click('[data-testid="redeem-button"]');

    // 验证错误消息
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText('请输入有效的邮箱地址');
  });

  test('显示无效兑换码错误', async ({ page }) => {
    // 填写有效邮箱
    await page.fill('[data-testid="email-input"]', 'test@example.com');

    // 填写无效兑换码
    const codeInput = page.locator('[data-testid="code-input"]');
    if (await codeInput.isVisible()) {
      await codeInput.fill('INVALID-CODE');
    }

    // 点击兑换按钮
    await page.click('[data-testid="redeem-button"]');

    // 验证错误消息
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('兑换码无效');
  });

  test('表单验证状态', async ({ page }) => {
    // 初始状态：按钮应该被禁用
    await expect(page.locator('[data-testid="redeem-button"]')).toBeDisabled();

    // 输入无效邮箱：按钮仍然被禁用
    await page.fill('[data-testid="email-input"]', 'invalid');
    await expect(page.locator('[data-testid="redeem-button"]')).toBeDisabled();

    // 输入有效邮箱：按钮应该启用
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await expect(page.locator('[data-testid="redeem-button"]')).toBeEnabled();
  });

  test('加载状态显示', async ({ page }) => {
    // Mock 慢响应
    await page.route('**/api/public/redeem', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: '兑换成功',
          invite_id: 'test-invite-id'
        })
      });
    });

    // 填写表单
    await page.fill('[data-testid="email-input"]', 'test@example.com');

    const codeInput = page.locator('[data-testid="code-input"]');
    if (await codeInput.isVisible()) {
      await codeInput.fill('VALID-CODE');
    }

    // 点击兑换按钮
    await page.click('[data-testid="redeem-button"]');

    // 验证加载状态
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    await expect(page.locator('[data-testid="redeem-button"]')).toBeDisabled();
    await expect(page.locator('[data-testid="redeem-button"]')).toContainText('兑换中...');

    // 等待请求完成
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();
  });

  test('网络错误处理', async ({ page }) => {
    // Mock 网络错误
    await page.route('**/api/public/redeem', route => {
      route.abort('failed');
    });

    // 填写表单
    await page.fill('[data-testid="email-input"]', 'test@example.com');

    const codeInput = page.locator('[data-testid="code-input"]');
    if (await codeInput.isVisible()) {
      await codeInput.fill('VALID-CODE');
    }

    // 点击兑换按钮
    await page.click('[data-testid="redeem-button"]');

    // 验证错误消息
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('网络错误');
  });

  test('键盘导航', async ({ page }) => {
    // 使用Tab键导航
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="email-input"]')).toBeFocused();

    // 输入邮箱
    await page.fill('[data-testid="email-input"]', 'test@example.com');

    // 按Enter键提交表单
    await page.keyboard.press('Enter');

    // 验证表单提交
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
  });

  test('响应式设计', async ({ page }) => {
    // 测试桌面视图
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('[data-testid="redeem-form"]')).toBeVisible();

    // 测试平板视图
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-testid="redeem-form"]')).toBeVisible();

    // 测试手机视图
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-testid="redeem-form"]')).toBeVisible();

    // 验证移动端特定的UI元素
    await expect(page.locator('[data-testid="mobile-layout"]')).toBeVisible();
  });
});