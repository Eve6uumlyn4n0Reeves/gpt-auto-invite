#!/bin/bash

# 开发环境启动脚本（UTF-8）
set -e

echo "🚀 启动开发环境..."

# 解析项目根目录（cloud/）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
WEB_DIR="${ROOT_DIR}/web"

# 检查环境变量
source "${ROOT_DIR}/scripts/check-env.sh"

# 激活虚拟环境（可选）
if [ -d "${ROOT_DIR}/venv" ]; then
  # cloud 根目录存在 venv
  source "${ROOT_DIR}/venv/bin/activate"
elif [ -d "${BACKEND_DIR}/venv" ]; then
  # backend 目录存在 venv
  source "${BACKEND_DIR}/venv/bin/activate"
else
  echo "⚪ 未发现 Python 虚拟环境，将尝试使用系统 Python（如失败请先运行 setup.sh）"
fi

# 启动后端服务（在 backend 目录运行，便于导入 app 包）
echo "🔧 启动后端服务..."
pushd "${BACKEND_DIR}" >/dev/null
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
popd >/dev/null

# 等待后端启动
echo "⏳ 等待后端服务启动..."
sleep 3

# 设置环境变量
export BACKEND_URL="http://localhost:8000"
export NODE_ENV="development"
echo "🔧 设置环境变量: BACKEND_URL=$BACKEND_URL"

# 启动前端服务（优先 pnpm，回退 npm）
echo "🎨 启动前端服务..."
pushd "${WEB_DIR}" >/dev/null
if command -v pnpm >/dev/null 2>&1; then
  BACKEND_URL=$BACKEND_URL NODE_ENV=$NODE_ENV pnpm dev &
elif command -v npm >/dev/null 2>&1; then
  BACKEND_URL=$BACKEND_URL NODE_ENV=$NODE_ENV npm run dev &
else
  echo "❌ 未找到 pnpm/npm，请先安装 Node.js 包管理器。"
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi
FRONTEND_PID=$!
popd >/dev/null

# 显示服务信息
echo ""
echo "✅ 开发环境已启动！"
echo ""
echo "🌐 服务地址："
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo ""
echo "📱 功能页面："
echo "  用户兑换: http://localhost:3000/redeem"
echo "  管理后台: http://localhost:3000/admin"
echo ""
echo "⏹️ 停止服务: Ctrl+C"

# 等待用户中断
trap "echo ''; echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

wait
