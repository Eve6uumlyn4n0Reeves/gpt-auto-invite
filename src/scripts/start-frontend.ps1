[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "启动前端开发服务器..."
Push-Location "$PSScriptRoot\.."
try {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm exec next dev -H 127.0.0.1 -p 3000
  } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    npx next dev -H 127.0.0.1 -p 3000
  } else {
    Write-Error "未找到 pnpm/npm，请先安装 Node.js 包管理器。"
  }
}
finally {
  Pop-Location
}
