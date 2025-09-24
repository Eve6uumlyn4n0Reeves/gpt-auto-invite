param(
  [int]$Port = 8000
)

Write-Host "Starting server on port $Port..."
uvicorn app.main:app --host 0.0.0.0 --port $Port --reload
