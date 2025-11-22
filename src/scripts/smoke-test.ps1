[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Param(
  [string]$Base = "http://localhost:8000",
  [string]$Pass = "admin"
)

Write-Host "🚬 冒烟测试开始：BASE=$Base"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Expect-Status($Resp, $Wanted) {
  if ($null -eq $Resp) { throw "请求失败（无响应）" }
  $code = $Resp.StatusCode.value__
  if ($code -ne $Wanted) {
    $body = try { $Resp.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10 } catch { $Resp.Content }
    throw "HTTP $code（期望 $Wanted）`n响应: $body"
  }
}

try {
  # 1) 健康检查
  Write-Host "`n▶ 后端健康检查 /health"
  $r = Invoke-WebRequest -Uri "$Base/health" -Method GET -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ /health OK"

  # 2) 登录
  Write-Host "`n▶ 管理员登录 /api/admin/login"
  $payload = @{ password = $Pass } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "$Base/api/admin/login" -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ 登录成功（已保存 Cookie）"

  # 3) 创建母号
  Write-Host "`n▶ 创建母号 /api/admin/mothers"
  $payload = @{
    name = 'test@example.com'
    access_token = 'tok_demo'
    teams = @(@{ team_id='t_demo'; team_name='Team Demo'; is_enabled=$true; is_default=$true })
    notes = 'smoke-test'
  } | ConvertTo-Json -Depth 5
  $r = Invoke-WebRequest -Uri "$Base/api/admin/mothers" -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ 创建母号成功"

  # 4) 生成兑换码
  Write-Host "`n▶ 生成兑换码 /api/admin/codes"
  $payload = @{ count = 1 } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "$Base/api/admin/codes" -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ 生成兑换码成功"

  # 5) 统计
  Write-Host "`n▶ 获取统计 /api/admin/stats"
  $r = Invoke-WebRequest -Uri "$Base/api/admin/stats" -Method GET -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ 统计获取成功"

  # 6) 指标
  Write-Host "`n▶ 获取指标 /metrics"
  $r = Invoke-WebRequest -Uri "$Base/metrics" -Method GET -UseBasicParsing -WebSession $session
  Expect-Status $r 200
  Write-Host "✅ 指标获取成功"

  Write-Host "`n🎉 冒烟测试通过：核心管理接口可用。"
  Write-Host "提示：兑换 /api/redeem 需有效上游 token，这里未覆盖。"
}
catch {
  Write-Error $_
  exit 1
}
exit 0

