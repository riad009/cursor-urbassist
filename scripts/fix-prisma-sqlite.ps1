# Run this AFTER stopping the dev server (Ctrl+C on "npm run dev").
# Fixes: "the URL must start with the protocol postgresql" when using SQLite (file:./dev.db)
# If no temp file exists, run: npx prisma generate (with server stopped).

$clientDir = Join-Path $PSScriptRoot "..\node_modules\.prisma\client"
if (-not (Test-Path $clientDir)) {
  Write-Host "Prisma client not found. Run: npx prisma generate" -ForegroundColor Yellow
  exit 1
}

$dll = Join-Path $clientDir "query_engine-windows.dll.node"
$tmp = Get-ChildItem -Path $clientDir -Filter "query_engine-windows.dll.node.tmp*" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($tmp) {
  Copy-Item -Path $tmp.FullName -Destination $dll -Force
  Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
  Write-Host "Prisma SQLite engine installed. Start the app with: npm run dev" -ForegroundColor Green
} else {
  Write-Host "No temp engine found. Run: npx prisma generate" -ForegroundColor Yellow
  Set-Location (Join-Path $PSScriptRoot "..")
  npx prisma generate
}
