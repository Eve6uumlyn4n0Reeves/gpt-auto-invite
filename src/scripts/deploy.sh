#!/bin/bash

# 生产环境部署脚本（UTF-8）
set -e

echo "🚀 开始部署到生产环境..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
WEB_DIR="${ROOT_DIR}/web"

# 检查环境变量（与后端一致）
if [ -z "${ADMIN_INITIAL_PASSWORD}" ] || [ -z "${SECRET_KEY}" ] || [ -z "${ENCRYPTION_KEY}" ]; then
  echo "❌ 缺少必要的环境变量，请设置："
  echo "  - ADMIN_INITIAL_PASSWORD"
  echo "  - SECRET_KEY"
  echo "  - ENCRYPTION_KEY"
  exit 1
fi

# 激活虚拟环境
if [ -d "${ROOT_DIR}/venv" ]; then
  source "${ROOT_DIR}/venv/bin/activate"
else
  echo "⚪ 未发现虚拟环境，正在创建..."
  python3 -m venv "${ROOT_DIR}/venv"
  source "${ROOT_DIR}/venv/bin/activate"
fi

# 更新依赖
echo "📦 更新依赖..."
pip install --upgrade pip
pip install --upgrade -r "${BACKEND_DIR}/requirements.backend.txt"

pushd "${WEB_DIR}" >/dev/null
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile --prod || pnpm install --prod
else
  npm ci --production || npm install --production
fi
popd >/dev/null

# 构建前端
echo "🏗️ 构建前端..."
pushd "${WEB_DIR}" >/dev/null
if command -v pnpm >/dev/null 2>&1; then
  pnpm build
else
  npm run build
fi
popd >/dev/null

# 初始化/迁移数据库（当前使用 create_all）
echo "🗄️ 初始化数据库..."
pushd "${BACKEND_DIR}" >/dev/null
python -c "from app.database import init_db; init_db(); print('数据库已初始化')"
popd >/dev/null

# 重启服务（如使用 systemd）
echo "🔄 重启服务..."
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart gpt-invite-backend || true
  sudo systemctl restart gpt-invite-frontend || true
  echo "✅ 服务已重启"
else
  echo "⚠️ 未检测到 systemd，请按实际部署方式重启服务/Docker 容器"
fi

echo "✅ 部署完成！"
