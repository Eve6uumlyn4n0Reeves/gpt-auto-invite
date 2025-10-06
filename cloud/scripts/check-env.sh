#!/bin/bash

# 环境变量检查脚本

echo "🔍 检查环境变量配置..."

# 必需的环境变量列表
REQUIRED_VARS=(
    "BACKEND_URL"
    "ADMIN_INITIAL_PASSWORD"
    "SECRET_KEY"
    "ENCRYPTION_KEY"
)

# 可选的环境变量列表
OPTIONAL_VARS=(
    "NEXT_PUBLIC_BACKEND_URL"
    "DATABASE_URL"
    "SMTP_HOST"
    "SMTP_PORT"
    "SMTP_USER"
    "SMTP_PASS"
    "RATE_LIMIT_REQUESTS"
    "RATE_LIMIT_WINDOW"
    "LOG_LEVEL"
    "NODE_ENV"
    "ENV"
)

missing_vars=()
present_vars=()

# 检查必需的环境变量
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    else
        present_vars+=("$var")
    fi
done

# 显示结果
echo ""
echo "✅ 已配置的必需环境变量:"
for var in "${present_vars[@]}"; do
    echo "  - $var"
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo ""
    echo "❌ 缺少的必需环境变量:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "请在 .env.local 文件中配置这些环境变量"
    exit 1
fi

echo ""
echo "📋 可选环境变量状态:"
for var in "${OPTIONAL_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo "  ✅ $var"
    else
        echo "  ⚪ $var (未配置)"
    fi
done

echo ""
echo "🎉 环境变量检查完成！"
