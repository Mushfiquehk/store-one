#Requires -RunAsAdministrator
<#
.SYNOPSIS
    CornerPOS local development setup script (Windows).
.DESCRIPTION
    Installs PostgreSQL 17 (if needed), creates the 'cornerpos' database,
    sets the postgres superuser password, writes a .env file, and installs
    npm dependencies. Run this once on a fresh clone.
.NOTES
    Requirements:
      - Windows 10/11 with winget (App Installer)
      - Node.js 18+ already installed  (https://nodejs.org)
      - Must be run as Administrator (required for PostgreSQL service install)
    After this script completes, start the app with:  npm run dev
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PG_VERSION   = "17"
$PG_BIN       = "C:\Program Files\PostgreSQL\$PG_VERSION\bin"
$PG_DATA      = "C:\Program Files\PostgreSQL\$PG_VERSION\data"
$PG_HBA       = "$PG_DATA\pg_hba.conf"
$PG_SERVICE   = "postgresql-x64-$PG_VERSION"
$DB_NAME      = "cornerpos"
$DB_USER      = "postgres"
$DB_PASSWORD  = "cornerpos2024"
$DB_PORT      = "5432"
$SCRIPT_DIR   = $PSScriptRoot

# ─── helpers ──────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [WARN] $msg" -ForegroundColor Yellow }

function Reload-PgHba {
    # Send SIGHUP (128) to the running service so it re-reads pg_hba.conf
    sc.exe control $PG_SERVICE 128 | Out-Null
    Start-Sleep -Seconds 2
}

function Invoke-Psql([string]$sql) {
    $env:PGPASSWORD = $DB_PASSWORD
    & "$PG_BIN\psql.exe" -U $DB_USER -h 127.0.0.1 -p $DB_PORT -c $sql 2>&1
    $env:PGPASSWORD = ""
}

# ─── 1. Node / npm ────────────────────────────────────────────────────────────
Write-Step "Checking Node.js"
try {
    $nodeVer = node --version 2>&1
    Write-OK "Node.js $nodeVer found"
} catch {
    Write-Error "Node.js is not installed. Download it from https://nodejs.org and re-run this script."
}

# ─── 2. PostgreSQL ────────────────────────────────────────────────────────────
Write-Step "Checking PostgreSQL $PG_VERSION"
$pgInstalled = Test-Path "$PG_BIN\psql.exe"

if (-not $pgInstalled) {
    Write-Warn "PostgreSQL $PG_VERSION not found — installing via winget (this may take a few minutes)..."
    winget install -e --id "PostgreSQL.PostgreSQL.$PG_VERSION" `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements `
        --override "--mode unattended --superpassword $DB_PASSWORD --serverport $DB_PORT --unattendedmodeui none"

    # Wait for service to come up
    $timeout = 60
    $elapsed = 0
    while ((Get-Service $PG_SERVICE -ErrorAction SilentlyContinue).Status -ne "Running") {
        Start-Sleep -Seconds 2
        $elapsed += 2
        if ($elapsed -ge $timeout) { Write-Error "PostgreSQL service did not start in time." }
    }
    Write-OK "PostgreSQL $PG_VERSION installed and service is running"
} else {
    Write-OK "PostgreSQL $PG_VERSION already installed"
}

# Ensure service is running
$svcStatus = (Get-Service $PG_SERVICE -ErrorAction SilentlyContinue).Status
if ($svcStatus -ne "Running") {
    Write-Warn "PostgreSQL service is not running — starting it..."
    Start-Service $PG_SERVICE
    Start-Sleep -Seconds 3
    Write-OK "Service started"
} else {
    Write-OK "PostgreSQL service is running"
}

# ─── 3. Set postgres password & create database ───────────────────────────────
Write-Step "Configuring PostgreSQL user and database"

# Temporarily allow passwordless local connections so we can bootstrap
Write-Warn "Temporarily setting pg_hba.conf to trust for 127.0.0.1..."
$hbaContent = Get-Content $PG_HBA -Raw
$hbaPatched = $hbaContent -replace `
    'host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256', `
    'host    all             all             127.0.0.1/32            trust'
Set-Content -Path $PG_HBA -Value $hbaPatched -NoNewline
Reload-PgHba

# Now connect without password to set the known password
$env:PGPASSWORD = ""
& "$PG_BIN\psql.exe" -U $DB_USER -h 127.0.0.1 -p $DB_PORT `
    -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>&1 | Out-Null
Write-OK "postgres superuser password set"

# Create DB if it doesn't exist
$dbExists = & "$PG_BIN\psql.exe" -U $DB_USER -h 127.0.0.1 -p $DB_PORT `
    -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>&1
if ($dbExists -notmatch "1") {
    & "$PG_BIN\createdb.exe" -U $DB_USER -h 127.0.0.1 -p $DB_PORT $DB_NAME 2>&1 | Out-Null
    Write-OK "Database '$DB_NAME' created"
} else {
    Write-OK "Database '$DB_NAME' already exists"
}

# Revert pg_hba.conf back to scram-sha-256
Write-Warn "Reverting pg_hba.conf back to scram-sha-256..."
$hbaReverted = (Get-Content $PG_HBA -Raw) -replace `
    'host\s+all\s+all\s+127\.0\.0\.1/32\s+trust', `
    'host    all             all             127.0.0.1/32            scram-sha-256'
Set-Content -Path $PG_HBA -Value $hbaReverted -NoNewline
Reload-PgHba

# Verify connection with password
$env:PGPASSWORD = $DB_PASSWORD
$check = & "$PG_BIN\psql.exe" -U $DB_USER -h 127.0.0.1 -p $DB_PORT -d $DB_NAME `
    -tAc "SELECT 'ok';" 2>&1
$env:PGPASSWORD = ""
if ($check -match "ok") {
    Write-OK "Database connection verified (scram-sha-256 auth working)"
} else {
    Write-Error "Could not connect to database after setup. Check PostgreSQL logs."
}

# ─── 4. .env file ─────────────────────────────────────────────────────────────
Write-Step "Writing .env"
$envFile = Join-Path $SCRIPT_DIR ".env"
if (-not (Test-Path $envFile)) {
    "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}" |
        Set-Content -Path $envFile
    Write-OK ".env created"
} else {
    Write-OK ".env already exists — skipping"
}

# ─── 5. npm install ───────────────────────────────────────────────────────────
Write-Step "Installing npm dependencies"
Push-Location $SCRIPT_DIR
npm install
Pop-Location
Write-OK "npm install complete"

# ─── Done ─────────────────────────────────────────────────────────────────────
Write-Host @"

╔══════════════════════════════════════════════════════╗
║  Setup complete!                                     ║
║                                                      ║
║  Start the dev server:                               ║
║    npm run dev                                       ║
║                                                      ║
║  App:     http://localhost:5000                      ║
║  API:     http://localhost:3001                      ║
║  DB:      postgresql://postgres@127.0.0.1/cornerpos  ║
╚══════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
