#!/bin/bash

# 简易冒烟脚本（UTF-8 无 BOM）
# 依赖：curl

set -euo pipefail

BASE=${BASE:-http://localhost:8000}
PASS=${PASS:-admin}

echo "🚬 冒烟测试开始：BASE=${BASE}"

TMP_DIR=$(mktemp -d)
COOKIES_FILE="${TMP_DIR}/cookies.txt"

cleanup() {
  rm -rf "${TMP_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

step() {
  echo "\n▶ $1"
}

expect_http() {
  local code="$1"; shift
  local want="$1"; shift
  if [ "${code}" != "${want}" ]; then
    echo "❌ HTTP ${code}（期望 ${want}）"
    echo "—— 响应体 ——"
    cat "${TMP_DIR}/resp.json" || true
    exit 1
  fi
}

# 1) 健康检查
step "后端健康检查 /health"
code=$(curl -sS -o "${TMP_DIR}/resp.json" -w "%{http_code}" "${BASE}/health")
expect_http "${code}" 200
echo "✅ /health OK"

# 2) 管理员登录（设置 Cookie）
step "管理员登录 /api/admin/login"
payload='{"password":"'"${PASS}"'"}'
code=$(curl -sS -c "${COOKIES_FILE}" -o "${TMP_DIR}/resp.json" -w "%{http_code}" \
  -H 'Content-Type: application/json' -d "${payload}" \
  "${BASE}/api/admin/login")
expect_http "${code}" 200
echo "✅ 登录成功（已写入 Cookie: ${COOKIES_FILE}）"

# 3) 创建母号（包含一个启用且默认团队）
step "创建母号 /api/admin/mothers"
payload='{
  "name":"test@example.com",
  "access_token":"tok_demo",
  "teams":[{"team_id":"t_demo","team_name":"Team Demo","is_enabled":true,"is_default":true}],
  "notes":"smoke-test"
}'
code=$(curl -sS -b "${COOKIES_FILE}" -o "${TMP_DIR}/resp.json" -w "%{http_code}" \
  -H 'Content-Type: application/json' -d "${payload}" \
  "${BASE}/api/admin/mothers")
expect_http "${code}" 200
echo "✅ 创建母号成功"

# 4) 生成兑换码（1 个）
step "生成兑换码 /api/admin/codes"
payload='{"count":1}'
code=$(curl -sS -b "${COOKIES_FILE}" -o "${TMP_DIR}/resp.json" -w "%{http_code}" \
  -H 'Content-Type: application/json' -d "${payload}" \
  "${BASE}/api/admin/codes")
expect_http "${code}" 200
echo "✅ 生成兑换码成功"

# 5) 管理统计
step "获取统计 /api/admin/stats"
code=$(curl -sS -b "${COOKIES_FILE}" -o "${TMP_DIR}/resp.json" -w "%{http_code}" \
  "${BASE}/api/admin/stats")
expect_http "${code}" 200
echo "✅ 统计获取成功"

# 6) 指标（开发/生产均可，生产需登录 Cookie 已具备）
step "获取指标 /metrics"
code=$(curl -sS -b "${COOKIES_FILE}" -o "${TMP_DIR}/resp.txt" -w "%{http_code}" \
  "${BASE}/metrics")
expect_http "${code}" 200
echo "✅ 指标获取成功"

echo "\n🎉 冒烟测试通过：核心管理接口可用。"
echo "提示：兑换 /api/redeem 需有效上游 token，这里未覆盖。"

