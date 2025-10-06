#!/usr/bin/env bash
set -euo pipefail

# 强制覆盖远端仓库分支
# 用法：
#   export GITHUB_USER="your-username"
#   export GITHUB_TOKEN="ghp_xxx"   # 或 Fine-grained Token
#   ./scripts/publish.sh https://github.com/Eve6uumlyn4n0Reeves/gpt-auto-invite.git main

REPO_URL="${1:-https://github.com/Eve6uumlyn4n0Reeves/gpt-auto-invite.git}"
BRANCH="${2:-main}"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "[ERROR] 请先导出 GITHUB_TOKEN 环境变量" >&2
  exit 1
fi

if [[ ! -d .git ]]; then
  git init -b "$BRANCH"
fi

git add -A
git commit -m "chore: force publish current workspace" || true

# 将 Token 嵌入到 URL（避免交互输入）。注意：命令历史可能可见，建议用一次性 shell 执行。
SAFE_URL="${REPO_URL/https:\/\//https://oauth2:${GITHUB_TOKEN}@}"
git remote remove origin 2>/dev/null || true
git remote add origin "$SAFE_URL"
git push -f origin "$BRANCH"

echo "[OK] 已强制推送到 $REPO_URL ($BRANCH)"

