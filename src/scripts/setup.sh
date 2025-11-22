#!/bin/bash

# GPT Team Auto Invite Service 安装脚本（UTF-8）
# 适用于 Ubuntu/Debian 系统
set -e

echo "🚀 开始安装 GPT Team Auto Invite Service..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
WEB_DIR="${ROOT_DIR}/web"

# 检查 Python
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ Python 3 未安装，请先安装 Python 3.10+"
  exit 1
fi
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✅ 检测到 Python ${PYTHON_VERSION}"

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js 未安装，请先安装 Node.js 18+"
  exit 1
fi
echo "✅ 检测到 Node.js $(node --version)"

# 创建虚拟环境（在 cloud 根目录）
echo "📦 创建 Python 虚拟环境..."
python3 -m venv "${ROOT_DIR}/venv"
source "${ROOT_DIR}/venv/bin/activate"
pip install --upgrade pip

# 安装后端依赖
echo "📦 安装后端依赖..."
pip install -r "${BACKEND_DIR}/requirements.backend.txt"

# 安装前端依赖（优先 pnpm）
echo "📦 安装前端依赖..."
pushd "${WEB_DIR}" >/dev/null
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile || pnpm install
else
  npm install
fi
popd >/dev/null

# 初始化数据库
echo "🗄️ 初始化数据库..."
pushd "${BACKEND_DIR}" >/dev/null
python -c "from app.database import init_db; init_db(); print('数据库表创建完成')"
popd >/dev/null

# 构建前端
echo "🏗️ 构建前端应用..."
pushd "${WEB_DIR}" >/dev/null
if command -v pnpm >/dev/null 2>&1; then
  pnpm build
else
  npm run build
fi
popd >/dev/null

echo "✅ 安装完成！"
echo ""
echo "🚀 启动服务："
echo "  后端: bash scripts/start-dev.sh（或手动：cd backend && uvicorn app.main:app --reload --port 8000）"
echo "  前端: cd web && pnpm dev（或 npm run dev）"
echo ""
echo "🌐 访问地址："
echo "  用户端: http://localhost:3000/redeem"
echo "  管理端: http://localhost:3000/admin"
