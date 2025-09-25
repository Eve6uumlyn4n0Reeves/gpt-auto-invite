#!/bin/bash

# 开发环境启动脚本

set -e

echo "🚀 启动开发环境..."

# 检查环境变量
source scripts/check-env.sh

# 激活虚拟环境
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "❌ 虚拟环境不存在，请先运行 setup.sh"
    exit 1
fi

# 启动后端服务
echo "🔧 启动后端服务..."
cd app
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# 等待后端启动
echo "⏳ 等待后端服务启动..."
sleep 3

# 启动前端服务
echo "🎨 启动前端服务..."
npm run dev &
FRONTEND_PID=$!

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
