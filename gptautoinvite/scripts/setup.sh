#!/bin/bash

# GPT Team Auto Invite Service 安装脚本
# 适用于 Ubuntu/Debian 系统

set -e

echo "🚀 开始安装 GPT Team Auto Invite Service..."

# 检查 Python 版本
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 未安装，请先安装 Python 3.8+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✅ 检测到 Python $PYTHON_VERSION"

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ 检测到 Node.js $NODE_VERSION"

# 创建虚拟环境
echo "📦 创建 Python 虚拟环境..."
python3 -m venv venv
source venv/bin/activate

# 安装 Python 依赖
echo "📦 安装 Python 依赖..."
pip install --upgrade pip
pip install -r requirements.txt

# 安装 Node.js 依赖
echo "📦 安装 Node.js 依赖..."
npm install

# 创建环境变量文件
if [ ! -f .env.local ]; then
    echo "⚙️ 创建环境变量文件..."
    cp .env.example .env.local
    echo "📝 请编辑 .env.local 文件配置您的环境变量"
fi

# 初始化数据库
echo "🗄️ 初始化数据库..."
cd app
python -c "from database import init_db; init_db()"
cd ..

# 构建前端
echo "🏗️ 构建前端应用..."
npm run build

echo "✅ 安装完成！"
echo ""
echo "🚀 启动服务："
echo "  后端: cd app && uvicorn main:app --reload --port 8000"
echo "  前端: npm start"
echo ""
echo "🌐 访问地址："
echo "  用户端: http://localhost:3000/redeem"
echo "  管理端: http://localhost:3000/admin"
echo ""
echo "⚠️ 请确保已正确配置 .env.local 文件中的环境变量"
