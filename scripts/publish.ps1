[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
param(
  [string]$RepoUrl = "https://github.com/Eve6uumlyn4n0Reeves/gpt-auto-invite.git",
  [string]$Branch = "main"
)

if (-not $env:GITHUB_TOKEN) {
  Write-Error "请先设置环境变量 GITHUB_TOKEN"
  exit 1
}

if (-not (Test-Path .git)) {
  git init -b $Branch
}

git add -A
git commit -m "chore: force publish current workspace" 2>$null

# 将 Token 写入 URL（命令历史可能可见，建议用一次性会话）
$safeUrl = $RepoUrl -replace '^https://','https://oauth2:' + $env:GITHUB_TOKEN + '@'
git remote remove origin 2>$null
git remote add origin $safeUrl
git push -f origin $Branch

Write-Host "[OK] 已强制推送到 $RepoUrl ($Branch)"

