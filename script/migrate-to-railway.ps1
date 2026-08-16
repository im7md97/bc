# Migrate the local embedded Postgres database (qcportal on :5433) to a
# Railway Postgres instance.
#
# Usage:
#   1. Make sure the local DB is RUNNING (npm run db:start)
#   2. Open PowerShell, run:
#        .\script\migrate-to-railway.ps1 -RailwayUrl "postgresql://postgres:XXX@viaduct.proxy.rlwy.net:12345/railway"
#
# What it does:
#   1. Dumps the entire local qcportal database to .\railway-migration.sql
#   2. Restores it into the Railway Postgres at the given URL
#   3. Verifies by printing the resulting table list

param(
  [Parameter(Mandatory = $true)]
  [string]$RailwayUrl
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pgBin = Join-Path $root "node_modules\@embedded-postgres\windows-x64\native\bin"
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql   = Join-Path $pgBin "psql.exe"

if (-not (Test-Path $pgDump) -or -not (Test-Path $psql)) {
  Write-Error "pg_dump/psql not found in node_modules. Run 'npm install' first."
  exit 1
}

$dumpFile = Join-Path $root "railway-migration.sql"

Write-Host "[1/3] Dumping local qcportal -> $dumpFile" -ForegroundColor Cyan
$env:PGPASSWORD = "postgres"
& $pgDump -h localhost -p 5433 -U postgres -d qcportal `
          --no-owner --no-acl --clean --if-exists `
          -f $dumpFile
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed"; exit 1 }

Write-Host "[2/3] Restoring into Railway..." -ForegroundColor Cyan
& $psql $RailwayUrl -v ON_ERROR_STOP=1 -f $dumpFile
if ($LASTEXITCODE -ne 0) { Write-Error "psql restore failed"; exit 1 }

Write-Host "[3/3] Verifying tables on Railway:" -ForegroundColor Cyan
& $psql $RailwayUrl -c "\dt"

Write-Host ""
Write-Host "Done. Next step: set DATABASE_URL=$RailwayUrl in your Railway service env." -ForegroundColor Green
