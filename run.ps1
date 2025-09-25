param(
  [int]$Port = 8000
)

# 统一控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Starting server on port $Port..."

Push-Location gptautoinvite
try {
  if (-not (Test-Path -Path 'data')) { New-Item -ItemType Directory -Path 'data' | Out-Null }
  uvicorn app.main:app --host 0.0.0.0 --port $Port --reload
}
finally {
  Pop-Location
}
