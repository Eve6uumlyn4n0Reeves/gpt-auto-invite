# 测试相关 Makefile

.PHONY: test test-backend test-frontend test-e2e test-all clean install

# 变量定义
BACKEND_DIR := cloud/backend
FRONTEND_DIR := cloud/web
E2E_DIR := e2e-tests

# 默认目标
test-all: test-backend test-frontend test-e2e

# 后端测试
test-backend:
	@echo "🔧 运行后端测试..."
	cd $(BACKEND_DIR) && \
	python -m pytest tests/ -v --cov=app --cov-report=html --cov-report=term

# 后端单元测试
test-backend-unit:
	@echo "🔧 运行后端单元测试..."
	cd $(BACKEND_DIR) && \
	python -m pytest tests/unit/ -v

# 后端集成测试
test-backend-integration:
	@echo "🔧 运行后端集成测试..."
	cd $(BACKEND_DIR) && \
	python -m pytest tests/integration/ -v

# 后端性能测试
test-backend-performance:
	@echo "🚀 运行后端性能测试..."
	cd $(BACKEND_DIR) && \
	python test_performance.py

# 前端测试
test-frontend:
	@echo "⚛️ 运行前端测试..."
	cd $(FRONTEND_DIR) && \
	npm test -- --coverage --reporter=verbose

# 前端监视模式测试
test-frontend-watch:
	@echo "⚛️ 运行前端测试(监视模式)..."
	cd $(FRONTEND_DIR) && \
	npm run test:watch

# 前端UI测试
test-frontend-ui:
	@echo "⚛️ 运行前端测试(UI模式)..."
	cd $(FRONTEND_DIR) && \
	npm run test:ui

# E2E测试
test-e2e:
	@echo "🎭 运行E2E测试..."
	cd $(E2E_DIR) && \
	npm test

# E2E测试(有界面)
test-e2e-headed:
	@echo "🎭 运行E2E测试(有界面)..."
	cd $(E2E_DIR) && \
	npm run test:headed

# E2E测试(调试模式)
test-e2e-debug:
	@echo "🐛 运行E2E测试(调试模式)..."
	cd $(E2E_DIR) && \
	npm run test:debug

# 快速测试(跳过慢速测试)
test-fast:
	@echo "⚡ 运行快速测试..."
	cd $(BACKEND_DIR) && \
	python -m pytest tests/ -v -m "not slow"
	cd $(FRONTEND_DIR) && \
	npm test -- --passWithNoTests

# 安装测试依赖
install:
	@echo "📦 安装测试依赖..."
	cd $(BACKEND_DIR) && \
	pip install -r requirements-test.txt
	cd $(FRONTEND_DIR) && \
	npm install
	cd $(E2E_DIR) && \
	npm install && \
	npm run install:browsers

# 代码格式化
format:
	@echo "🎨 格式化代码..."
	cd $(BACKEND_DIR) && \
	black tests/ && \
	isort tests/
	cd $(FRONTEND_DIR) && \
	npm run format || true

# 代码检查
lint:
	@echo "🔍 代码检查..."
	cd $(BACKEND_DIR) && \
	flake8 tests/ && \
	pylint tests/ || true
	cd $(FRONTEND_DIR) && \
	npm run lint || true

# 类型检查
type-check:
	@echo "📝 类型检查..."
	cd $(BACKEND_DIR) && \
	mypy tests/ || true
	cd $(FRONTEND_DIR) && \
	npm run type-check || true

# 安全扫描
security-scan:
	@echo "🔒 安全扫描..."
	cd $(BACKEND_DIR) && \
	bandit -r app/ tests/ || true
	cd $(FRONTEND_DIR) && \
	npm audit || true

# 生成测试报告
reports:
	@echo "📊 生成测试报告..."
	@echo "后端覆盖率报告: $(BACKEND_DIR)/htmlcov/index.html"
	@echo "前端覆盖率报告: $(FRONTEND_DIR)/coverage/index.html"
	@echo "E2E测试报告: $(E2E_DIR)/playwright-report/index.html"

# 清理测试文件
clean:
	@echo "🧹 清理测试文件..."
	cd $(BACKEND_DIR) && \
	rm -rf .coverage htmlcov/ .pytest_cache/ **/__pycache__/
	cd $(FRONTEND_DIR) && \
	rm -rf coverage/ node_modules/.cache/
	cd $(E2E_DIR) && \
	rm -rf playwright-report/ test-results/

# Docker测试(如果使用Docker)
test-docker:
	@echo "🐳 运行Docker测试..."
	docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

# 持续集成模拟
test-ci:
	@echo "🔄 模拟CI环境测试..."
	$(MAKE) install
	$(MAKE) lint
	$(MAKE) type-check
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) test-e2e
	$(MAKE) security-scan
	$(MAKE) reports

# 帮助信息
help:
	@echo "🧪 测试相关命令:"
	@echo ""
	@echo "  test-all              - 运行所有测试"
	@echo "  test-backend          - 运行后端测试"
	@echo "  test-backend-unit     - 运行后端单元测试"
	@echo "  test-backend-integration - 运行后端集成测试"
	@echo "  test-backend-performance - 运行后端性能测试"
	@echo "  test-frontend         - 运行前端测试"
	@echo "  test-frontend-watch   - 运行前端测试(监视模式)"
	@echo "  test-frontend-ui      - 运行前端测试(UI模式)"
	@echo "  test-e2e              - 运行E2E测试"
	@echo "  test-e2e-headed       - 运行E2E测试(有界面)"
	@echo "  test-e2e-debug        - 运行E2E测试(调试模式)"
	@echo "  test-fast             - 运行快速测试(跳过慢速测试)"
	@echo "  install               - 安装测试依赖"
	@echo "  format                - 格式化代码"
	@echo "  lint                  - 代码检查"
	@echo "  type-check            - 类型检查"
	@echo "  security-scan         - 安全扫描"
	@echo "  reports               - 生成测试报告"
	@echo "  clean                 - 清理测试文件"
	@echo "  test-docker           - Docker测试"
	@echo "  test-ci               - 模拟CI环境测试"
	@echo "  help                  - 显示帮助信息"