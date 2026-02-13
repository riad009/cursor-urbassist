# Run the project (Windows PowerShell)
# Usage: .\run-dev.ps1   or   powershell -ExecutionPolicy Bypass -File .\run-dev.ps1

Set-Location $PSScriptRoot

if (-not (Test-Path node_modules)) {
    Write-Host "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Remove stale Next.js dev lock (e.g. after a crash) so dev server can start
$lockPath = Join-Path $PSScriptRoot ".next\dev\lock"
if (Test-Path $lockPath) {
    Remove-Item $lockPath -Force
    Write-Host "Removed stale dev lock."
}

Write-Host "Starting dev server..."
npm run dev
