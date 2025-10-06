#!/bin/bash

# 生产环境部署脚本

set -e

echo "🚀 开始部署到生产环境..."

# 检查环境变量
if [ -z "$ADMIN_PASSWORD" ] || [ -z "$SESSION_SECRET" ] || [ -z "$ENCRYPTION_KEY" ]; then
    echo "❌ 缺少必要的环境变量，请设置："
    echo "  - ADMIN_PASSWORD"
    echo "  - SESSION_SECRET"
    echo "  - ENCRYPTION_KEY"
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

# 更新依赖
echo "📦 更新依赖..."
pip install --upgrade -r requirements.txt
npm ci --production

# 构建前端
echo "🏗️ 构建前端..."
npm run build

# 数据库迁移
echo "🗄️ 数据库迁移..."
cd app
python -c "from database import init_db; init_db()"
cd ..

# 重启服务
echo "🔄 重启服务..."
if command -v systemctl &> /dev/null; then
    sudo systemctl restart gpt-invite-backend
    sudo systemctl restart gpt-invite-frontend
    echo "✅ 服务已重启"
else
    echo "⚠️ 请手动重启服务"
fi

echo "✅ 部署完成！"
