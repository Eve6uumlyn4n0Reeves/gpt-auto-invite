import { test, expect } from '@playwright/test';

test.describe('管理员面板', () => {
  test.beforeEach(async ({ page }) => {
    // Mock登录状态
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    // 访问管理员页面
    await page.goto('/admin');
  });

  test('显示统计数据', async ({ page }) => {
    // 等待页面加载
    await expect(page.locator('[data-testid="stats-container"]')).toBeVisible();

    // 验证统计卡片显示
    await expect(page.locator('[data-testid="total-codes"]')).toBeVisible();
    await expect(page.locator('[data-testid="used-codes"]')).toBeVisible();
    await expect(page.locator('[data-testid="pending-invites"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-invites"]')).toBeVisible();

    // 验证数据显示
    await expect(page.locator('[data-testid="total-codes"]')).toContainText(/\d+/);
  });

  test('显示邀请列表', async ({ page }) => {
    // 等待列表加载
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();

    // 验证表头
    await expect(page.locator('[data-testid="table-header-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="table-header-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="table-header-date"]')).toBeVisible();

    // 验证数据行
    const rows = page.locator('[data-testid="invite-row"]');
    await expect(rows.first()).toBeVisible();
  });

  test('生成兑换码功能', async ({ page }) => {
    // 点击生成兑换码按钮
    await page.click('[data-testid="generate-codes-button"]');

    // 验证模态框打开
    await expect(page.locator('[data-testid="generate-modal"]')).toBeVisible();

    // 填写生成参数
    await page.fill('[data-testid="count-input"]', '10');
    await page.fill('[data-testid="prefix-input"]', 'TEST_');

    // 点击生成按钮
    await page.click('[data-testid="confirm-generate"]');

    // 等待生成完成
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('成功生成10个兑换码');

    // 验证模态框关闭
    await expect(page.locator('[data-testid="generate-modal"]')).not.toBeVisible();
  });

  test('搜索和筛选功能', async ({ page }) => {
    // 测试邮箱搜索
    await page.fill('[data-testid="search-input"]', 'test@example.com');
    await page.keyboard.press('Enter');

    // 等待搜索结果
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();

    // 测试状态筛选
    await page.click('[data-testid="status-filter"]');
    await page.click('[data-testid="status-pending"]');

    // 验证筛选结果
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();
  });

  test('分页功能', async ({ page }) => {
    // Mock大量数据
    await page.route('**/api/admin/invites*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invites: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            email: `user${i + 1}@example.com`,
            status: 'pending',
            created_at: new Date().toISOString()
          })),
          total: 100,
          page: 1,
          size: 10
        })
      });
    });

    // 等待数据加载
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();

    // 验证分页控件
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
    await expect(page.locator('[data-testid="page-info"]')).toContainText('1-10 / 100');

    // 点击下一页
    await page.click('[data-testid="next-page"]');

    // 验证页面更新
    await expect(page.locator('[data-testid="page-info"]')).toContainText('11-20 / 100');
  });

  test('导出功能', async ({ page }) => {
    // Mock导出API
    await page.route('**/api/admin/export/*', route => {
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="users.csv"'
        },
        body: 'Email,Status,Created At\nuser1@example.com,pending,2024-01-01'
      });
    });

    // 点击导出按钮
    await page.click('[data-testid="export-button"]');

    // 等待下载开始
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-users"]');
    const download = await downloadPromise;

    // 验证文件名
    expect(download.suggestedFilename()).toBe('users.csv');
  });

  test('刷新数据功能', async ({ page }) => {
    // 点击刷新按钮
    await page.click('[data-testid="refresh-button"]');

    // 验证加载状态
    await expect(page.locator('[data-testid="refresh-loading"]')).toBeVisible();

    // 等待刷新完成
    await expect(page.locator('[data-testid="refresh-loading"]')).not.toBeVisible();

    // 验证数据已更新
    await expect(page.locator('[data-testid="stats-container"]')).toBeVisible();
  });

  test('错误处理', async ({ page }) => {
    // Mock API错误
    await page.route('**/api/admin/stats', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: '服务器错误' })
      });
    });

    // 刷新页面触发错误
    await page.reload();

    // 验证错误消息显示
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('加载失败');
  });

  test('权限验证', async ({ page }) => {
    // 清除登录状态
    await page.evaluate(() => {
      window.localStorage.removeItem('auth_token');
    });

    // 访问管理员页面
    await page.goto('/admin');

    // 验证重定向到登录页面
    await expect(page).toHaveURL(/.*\/admin\/login/);
  });

  test('响应式设计', async ({ page }) => {
    // 测试桌面视图
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();

    // 测试平板视图
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();

    // 测试手机视图
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();

    // 验证移动端侧边栏
    await page.click('[data-testid="menu-toggle"]');
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('数据表格排序', async ({ page }) => {
    // 等待表格加载
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();

    // 点击日期列排序
    await page.click('[data-testid="sort-date"]');

    // 验证排序图标显示
    await expect(page.locator('[data-testid="sort-asc"]')).toBeVisible();

    // 再次点击切换排序方向
    await page.click('[data-testid="sort-date"]');

    // 验证排序图标更新
    await expect(page.locator('[data-testid="sort-desc"]')).toBeVisible();
  });

  test('批量操作', async ({ page }) => {
    // 选择多个项目
    const checkboxes = page.locator('[data-testid="invite-checkbox"]');
    await checkboxes.first().check();
    await checkboxes.nth(1).check();

    // 验证批量操作按钮显示
    await expect(page.locator('[data-testid="batch-actions"]')).toBeVisible();

    // 点击批量删除
    await page.click('[data-testid="batch-delete"]');

    // 确认删除
    await page.click('[data-testid="confirm-delete"]');

    // 验证成功消息
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('成功删除2个邀请');
  });
});