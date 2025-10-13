#!/bin/bash

# 数据库初始化脚本（UTF-8）
set -e

echo "🗄️ 初始化数据库..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

# 激活虚拟环境（可选）
if [ -d "${ROOT_DIR}/venv" ]; then
  source "${ROOT_DIR}/venv/bin/activate"
fi

pushd "${BACKEND_DIR}" >/dev/null

python - <<'PY'
from app.database import init_db, SessionLocal
from app.services.services.admin import create_or_update_admin_default
from app.security import hash_password
import os

print('📦 创建数据库表...')
init_db()
print('✅ 数据库表已创建')

db = SessionLocal()
try:
    pwd = os.getenv('ADMIN_INITIAL_PASSWORD', 'admin')
    create_or_update_admin_default(db, hash_password(pwd))
    print('✅ 管理员初始密码已设置/存在')
finally:
    db.close()
PY

popd >/dev/null

echo "✅ 数据库初始化完成！"
