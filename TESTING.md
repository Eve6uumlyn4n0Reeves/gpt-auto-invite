# 测试文档

## 概述

本项目包含完整的测试套件，涵盖单元测试、集成测试和端到端测试，确保代码质量和系统可靠性。

## 测试架构

```
project/
├── cloud/
│   ├── backend/
│   │   ├── tests/
│   │   │   ├── unit/          # 单元测试
│   │   │   ├── integration/   # 集成测试
│   │   │   ├── factories/     # 测试数据工厂
│   │   │   ├── fixtures/      # 测试夹具
│   │   │   ├── helpers/       # 测试辅助工具
│   │   │   └── conftest.py    # pytest配置
│   │   └── pytest.ini         # pytest配置文件
│   └── web/
│       ├── test/
│       │   ├── unit/          # 前端单元测试
│       │   ├── integration/   # 前端集成测试
│       │   ├── mocks/         # Mock服务
│       │   └── setup.ts       # 测试设置
│       └── vitest.config.ts   # vitest配置
├── e2e-tests/                 # 端到端测试
│   ├── tests/                 # E2E测试用例
│   ├── package.json
│   └── playwright.config.ts   # Playwright配置
└── TESTING.md                 # 本文档
```

## 测试类型

### 1. 单元测试 (Unit Tests)

**目标**: 测试单个函数、类或组件的行为

**后端位置**: `cloud/backend/tests/unit/`
**前端位置**: `cloud/web/test/unit/`

**覆盖范围**:
- 业务逻辑函数
- 数据模型验证
- API服务层
- React组件逻辑
- 工具函数

### 2. 集成测试 (Integration Tests)

**目标**: 测试模块间交互和API端点

**后端位置**: `cloud/backend/tests/integration/`
**前端位置**: `cloud/web/test/integration/`

**覆盖范围**:
- API端点测试
- 数据库操作
- 中间件功能
- 第三方服务集成

### 3. 端到端测试 (E2E Tests)

**目标**: 测试完整的用户流程

**位置**: `e2e-tests/tests/`

**覆盖范围**:
- 用户注册/登录流程
- 兑换码使用流程
- 管理员操作流程
- 跨浏览器兼容性
- 移动端响应式设计

## 运行测试

### 后端测试

```bash
# 进入后端目录
cd cloud/backend

# 安装测试依赖
pip install -r requirements-test.txt

# 运行所有测试
pytest

# 运行特定类型的测试
pytest -m unit          # 只运行单元测试
pytest -m integration   # 只运行集成测试
pytest -m slow          # 只运行慢速测试

# 运行特定文件
pytest tests/unit/test_redeem_service.py

# 生成覆盖率报告
pytest --cov=app --cov-report=html

# 并行运行测试
pytest -n auto
```

### 前端测试

```bash
# 进入前端目录
cd cloud/web

# 运行所有测试
npm test

# 监视模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# UI测试界面
npm run test:ui
```

### E2E测试

```bash
# 进入E2E测试目录
cd e2e-tests

# 安装依赖
npm install

# 安装浏览器
npm run install:browsers

# 运行所有测试
npm test

# 运行特定测试
npx playwright test redeem-flow.spec.ts

# 有界面运行
npm run test:headed

# 调试模式
npm run test:debug

# UI测试界面
npm run test:ui

# 查看测试报告
npm run report
```

## 测试配置

### 后端配置 (pytest.ini)

```ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short --strict-markers --cov=app --cov-fail-under=80
markers =
    unit: 单元测试
    integration: 集成测试
    e2e: 端到端测试
    slow: 慢速测试
    auth: 认证相关测试
    admin: 管理员功能测试
```

### 前端配置 (vitest.config.ts)

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
})
```

### E2E配置 (playwright.config.ts)

```typescript
export default defineConfig({
  testDir: './tests',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'cd cloud/web && npm run dev',
    url: 'http://localhost:3000'
  }
})
```

## 测试数据管理

### 测试工厂 (Factories)

使用 `factory_boy` 创建测试数据：

```python
# tests/factories/__init__.py
class RedeemCodeFactory(factory.alchemy.SQLAlchemyModelFactory):
    class Meta:
        model = models.RedeemCode
        sqlalchemy_session_persistence = "commit"

    code_hash = factory.LazyFunction(lambda: fake.sha256())
    batch_id = factory.Faker("bothify", text="batch_#######")
    status = models.CodeStatus.unused
```

### 测试夹具 (Fixtures)

使用pytest夹具提供测试环境：

```python
# tests/conftest.py
@pytest.fixture
def db_session():
    """创建测试数据库会话"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

## Mock和存根

### 后端Mock

```python
# 使用unittest.mock
from unittest.mock import Mock, patch

with patch('app.services.services.invites.email_service') as mock_email:
    mock_email.send_invite_email.return_value = True
    # 执行测试
```

### 前端Mock

```typescript
// 使用MSW
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.post('/api/public/redeem', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ success: true, message: '兑换成功' })
    )
  })
)
```

## 持续集成

### GitHub Actions工作流

```yaml
name: Tests
on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      - name: Install dependencies
        run: |
          cd cloud/backend
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: |
          cd cloud/backend
          pytest --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v1

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      - name: Install dependencies
        run: |
          cd cloud/web
          npm ci
      - name: Run tests
        run: |
          cd cloud/web
          npm test -- --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      - name: Install dependencies
        run: |
          cd e2e-tests
          npm ci
          npx playwright install
      - name: Run E2E tests
        run: |
          cd e2e-tests
          npm test
      - name: Upload test results
        uses: actions/upload-artifact@v2
        if: always()
        with:
          name: playwright-report
          path: e2e-tests/playwright-report/
```

## 测试策略

### 测试金字塔

```
        /\
       /E2E\      少量端到端测试
      /------\
     /        \
    /Integration\  适量集成测试
   /------------\
  /              \
 /  Unit Tests    \ 大量单元测试
/------------------\
```

### 测试优先级

1. **高优先级**: 核心业务逻辑、安全功能、API端点
2. **中优先级**: 用户界面、数据库操作、第三方集成
3. **低优先级**: 边缘情况、性能优化、兼容性

### 覆盖率目标

- **语句覆盖率**: ≥ 80%
- **分支覆盖率**: ≥ 75%
- **函数覆盖率**: ≥ 90%
- **行覆盖率**: ≥ 80%

## 最佳实践

### 编写测试

1. **AAA模式**: Arrange-Act-Assert
2. **独立性**: 每个测试应该独立运行
3. **可重复性**: 测试结果应该一致
4. **快速执行**: 单元测试应该快速完成
5. **清晰命名**: 测试名称应该描述测试内容

```python
def test_redeem_code_success_with_valid_code_and_email():
    # Arrange - 准备测试数据
    code = "VALID_CODE"
    email = "test@example.com"

    # Act - 执行被测试的操作
    success, message = redeem_code(code, email)

    # Assert - 验证结果
    assert success is True
    assert "成功" in message
```

### 测试数据

1. **最小化**: 只创建必要的测试数据
2. **清理**: 测试后清理数据
3. **隔离**: 使用独立的测试数据库
4. **工厂化**: 使用工厂创建测试数据

### Mock使用

1. **最小化**: 只Mock外部依赖
2. **真实测试**: 优先测试真实行为
3. **验证Mock**: 验证Mock的调用

## 故障排除

### 常见问题

1. **测试数据库连接失败**
   ```bash
   # 检查数据库配置
   echo $DATABASE_URL
   # 使用内存数据库进行测试
   ```

2. **前端测试超时**
   ```bash
   # 增加超时时间
   npm test -- --timeout=10000
   ```

3. **E2E测试浏览器启动失败**
   ```bash
   # 重新安装浏览器
   npx playwright install
   ```

4. **Mock不生效**
   ```python
   # 检查Mock路径和import语句
   # 确保在正确的作用域内Mock
   ```

### 调试技巧

1. **使用调试器**
   ```python
   import pdb; pdb.set_trace()
   ```

2. **打印测试状态**
   ```python
   print(f"Test state: {test_data}")
   ```

3. **E2E调试模式**
   ```bash
   npx playwright test --debug
   ```

4. **查看测试报告**
   ```bash
   # 后端覆盖率报告
   open cloud/backend/htmlcov/index.html

   # 前端覆盖率报告
   open cloud/web/coverage/index.html

   # E2E测试报告
   open e2e-tests/playwright-report/index.html
   ```

## 贡献指南

### 添加新测试

1. **确定测试类型**: 单元测试、集成测试或E2E测试
2. **选择合适位置**: 根据测试类型选择目录
3. **编写测试**: 遵循命名约定和最佳实践
4. **运行测试**: 确保测试通过
5. **检查覆盖率**: 确保达到覆盖率目标

### 代码审查

1. **测试完整性**: 检查是否覆盖所有场景
2. **测试质量**: 确保测试清晰、可维护
3. **覆盖率要求**: 确保达到最低覆盖率标准
4. **性能影响**: 确保测试不会显著降低CI/CD速度

## 参考资源

- [pytest文档](https://docs.pytest.org/)
- [Vitest文档](https://vitest.dev/)
- [Playwright文档](https://playwright.dev/)
- [Testing Library文档](https://testing-library.com/)
- [工厂男孩文档](https://factoryboy.readthedocs.io/)
- [MSW文档](https://mswjs.io/)