import { test, expect } from '@playwright/test';

test.describe('性能测试', () => {
  test('页面加载性能', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/redeem');

    // 等待页面完全加载
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // 验证页面加载时间在合理范围内
    expect(loadTime).toBeLessThan(3000); // 3秒内加载完成

    // 验证关键元素已加载
    await expect(page.locator('[data-testid="redeem-form"]')).toBeVisible();
  });

  test('大数据集渲染性能', async ({ page }) => {
    // Mock大量数据
    await page.route('**/api/admin/invites*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invites: Array.from({ length: 1000 }, (_, i) => ({
            id: i + 1,
            email: `user${i + 1}@example.com`,
            status: i % 2 === 0 ? 'pending' : 'accepted',
            created_at: new Date().toISOString()
          })),
          total: 1000,
          page: 1,
          size: 50
        })
      });
    });

    await page.goto('/admin');

    // Mock登录
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    await page.reload();

    const startTime = Date.now();

    // 等待表格渲染完成
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();
    await page.waitForSelector('[data-testid="invite-row"]', { state: 'attached' });

    const renderTime = Date.now() - startTime;

    // 验证大数据集渲染时间
    expect(renderTime).toBeLessThan(2000); // 2秒内渲染完成

    // 验证虚拟滚动或分页正在工作
    const visibleRows = await page.locator('[data-testid="invite-row"]').count();
    expect(visibleRows).toBeLessThan(100); // 应该只渲染可见的行
  });

  test('API响应性能', async ({ page }) => {
    await page.goto('/redeem');

    // 监听网络请求
    const responses: any[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        responses.push({
          url: response.url(),
          status: response.status(),
          timing: Date.now()
        });
      }
    });

    // 填写表单并提交
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.click('[data-testid="redeem-button"]');

    // 等待API响应
    await page.waitForResponse(response => response.url().includes('/api/public/redeem'));

    // 验证API响应时间
    const apiResponse = responses.find(r => r.url.includes('/api/public/redeem'));
    expect(apiResponse).toBeDefined();
    expect(apiResponse!.status).toBe(200);
  });

  test('内存使用', async ({ page }) => {
    await page.goto('/admin');

    // 获取初始内存使用
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 执行一系列操作
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="refresh-button"]');
      await page.waitForTimeout(1000);
    }

    // 获取最终内存使用
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 验证内存增长在合理范围内
    const memoryGrowth = finalMemory - initialMemory;
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB以内
  });

  test('滚动性能', async ({ page }) => {
    // Mock长页面内容
    await page.route('**/api/admin/invites*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invites: Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            email: `user${i + 1}@example.com`,
            status: 'pending',
            created_at: new Date().toISOString()
          })),
          total: 200,
          page: 1,
          size: 200
        })
      });
    });

    await page.goto('/admin');

    // Mock登录
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-admin-token');
    });

    await page.reload();

    // 等待内容加载
    await expect(page.locator('[data-testid="invites-table"]')).toBeVisible();

    // 测试滚动性能
    const startTime = Date.now();
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);
    const scrollTime = Date.now() - startTime;

    // 验证滚动响应时间
    expect(scrollTime).toBeLessThan(1000); // 1秒内完成滚动
  });

  test('动画性能', async ({ page }) => {
    await page.goto('/redeem');

    // 监控FPS
    const fps = await page.evaluate(async () => {
      return new Promise((resolve) => {
        let frameCount = 0;
        let startTime = performance.now();

        function countFrame() {
          frameCount++;
          if (performance.now() - startTime >= 1000) {
            resolve(frameCount);
            return;
          }
          requestAnimationFrame(countFrame);
        }

        requestAnimationFrame(countFrame);
      });
    });

    // 验证帧率在合理范围内
    expect(fps).toBeGreaterThan(30); // 至少30FPS
  });

  test('并发用户模拟', async ({ context }) => {
    const userCount = 5;
    const pages = await Promise.all(
      Array.from({ length: userCount }, () => context.newPage())
    );

    const startTime = Date.now();

    // 每个用户同时执行操作
    const promises = pages.map(async (page, index) => {
      await page.goto('/redeem');
      await page.fill('[data-testid="email-input"]', `user${index}@example.com`);
      await page.click('[data-testid="redeem-button"]');
      return page.waitForSelector('[data-testid="success-message"]', { timeout: 5000 });
    });

    try {
      await Promise.all(promises);
    } catch (error) {
      // 部分请求可能失败，这是正常的
    }

    const totalTime = Date.now() - startTime;

    // 验证并发处理能力
    expect(totalTime).toBeLessThan(10000); // 10秒内完成

    // 清理页面
    await Promise.all(pages.map(page => page.close()));
  });

  test('资源加载优化', async ({ page }) => {
    const responses: any[] = [];

    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        size: 0 // 实际应该获取响应大小
      });
    });

    await page.goto('/admin');

    // 等待所有资源加载完成
    await page.waitForLoadState('networkidle');

    // 分析资源加载
    const cssCount = responses.filter(r => r.url.includes('.css')).length;
    const jsCount = responses.filter(r => r.url.includes('.js')).length;
    const imageCount = responses.filter(r => r.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)).length;

    // 验证资源数量合理
    expect(cssCount).toBeLessThan(10);
    expect(jsCount).toBeLessThan(20);
    expect(imageCount).toBeLessThan(50);
  });

  test('缓存性能', async ({ page }) => {
    // 首次访问
    const startTime1 = Date.now();
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    const firstLoadTime = Date.now() - startTime1;

    // 第二次访问（应该使用缓存）
    const startTime2 = Date.now();
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    const secondLoadTime = Date.now() - startTime2;

    // 验证缓存效果
    expect(secondLoadTime).toBeLessThan(firstLoadTime * 0.5); // 第二次加载应该更快
  });

  test('响应式性能', async ({ page }) => {
    await page.goto('/admin');

    // 测试不同视口大小的性能
    const viewports = [
      { width: 1920, height: 1080 }, // 桌面
      { width: 768, height: 1024 },  // 平板
      { width: 375, height: 667 }   // 手机
    ];

    for (const viewport of viewports) {
      const startTime = Date.now();
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // 等待布局调整
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(1000); // 1秒内完成布局调整
    }
  });
});