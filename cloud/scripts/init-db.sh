#!/bin/bash

# 数据库初始化脚本

set -e

echo "🗄️ 初始化数据库..."

# 检查 Python 环境
if [ ! -d "venv" ]; then
    echo "❌ 虚拟环境不存在，请先运行 setup.sh"
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

# 进入应用目录
cd app

# 初始化数据库
echo "📦 创建数据库表..."
python -c "
from database import init_db
from models import *
print('正在初始化数据库...')
init_db()
print('✅ 数据库初始化完成')
"

# 创建默认管理员（如果不存在）
echo "👤 检查管理员账户..."
python -c "
import os
from database import get_db
from models import Admin
from security import hash_password

db = next(get_db())
admin = db.query(Admin).first()

if not admin:
    admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
    hashed_password = hash_password(admin_password)
    
    new_admin = Admin(
        username='admin',
        password_hash=hashed_password,
        is_active=True
    )
    
    db.add(new_admin)
    db.commit()
    print('✅ 默认管理员账户已创建')
    print(f'用户名: admin')
    print(f'密码: {admin_password}')
else:
    print('✅ 管理员账户已存在')

db.close()
"

cd ..

echo "✅ 数据库初始化完成！"
