# CornerPOS — Local Development Setup (Windows)

> Last updated: 2026-07-09

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Windows | 10 / 11 | winget (App Installer) must be available |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Git | any | to clone the repo |

PostgreSQL is **installed automatically** by the setup script. You do **not** need to install it manually.

---

## Quick Start (recommended)

> [!IMPORTANT]
> The setup script must be run as **Administrator** because it installs PostgreSQL as a Windows service and writes to `C:\Program Files\PostgreSQL\`.

1. **Clone the repo**
   ```powershell
   git clone <repo-url> CornerPOS
   cd CornerPOS
   ```

2. **Run the setup script** (once, from an elevated PowerShell)
   ```powershell
   # Right-click PowerShell → "Run as Administrator", then:
   .\setup.ps1
   ```

3. **Start the dev server** (no admin needed after setup)
   ```powershell
   npm run dev
   ```

4. Open **http://localhost:5000** in your browser.

---

## What the setup script does

| Step | Command / Action |
|------|-----------------|
| Check Node.js | `node --version` |
| Install PostgreSQL 17 | `winget install PostgreSQL.PostgreSQL.17` (skipped if already installed) |
| Set postgres password | Temporarily sets `pg_hba.conf` → `trust`, runs `ALTER USER`, reverts to `scram-sha-256` |
| Create database | `createdb cornerpos` |
| Write `.env` | Creates `DATABASE_URL=postgresql://postgres:cornerpos2024@127.0.0.1:5432/cornerpos` |
| Install deps | `npm install` |

---

## Manual Setup (if you prefer not to use the script)

### 1 — Install PostgreSQL 17

```powershell
# Run as Administrator
winget install -e --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements
```

The installer will prompt for a superuser password during setup — use `cornerpos2024` (or any password, just update `.env` to match).

### 2 — Create the database

```powershell
$env:PGPASSWORD = "your-postgres-password"
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres -h 127.0.0.1 cornerpos
```

### 3 — Create the `.env` file

Create a file called `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres:your-postgres-password@127.0.0.1:5432/cornerpos
```

### 4 — Install npm dependencies

```powershell
npm install
```

### 5 — Start the dev server

```powershell
npm run dev
```

---

## Dev Server Ports

| Process | Port | Description |
|---------|------|-------------|
| Vite (frontend) | **5000** | React app, hot-reload |
| Express (backend) | **3001** | API server, proxied via `/api` |

Vite automatically proxies all `/api/*` requests to Express on port 3001 — you only ever need to open **http://localhost:5000**.

---

## Database Details

| Setting | Value |
|---------|-------|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `cornerpos` |
| User | `postgres` |
| Password | `cornerpos2024` |
| Service name | `postgresql-x64-17` |

The Express server **automatically creates all tables** on first start (no migration tool required). It also **auto-seeds demo data** (coffee shop dataset) if the admin tables are empty.

---

## Troubleshooting

### "password authentication failed for user postgres"
The `pg_hba.conf` may still be in `trust` mode or the password wasn't saved. Re-run `setup.ps1` as Administrator.

### Port 5000 or 3001 already in use
Find and kill the occupying process:
```powershell
netstat -ano | findstr ":5000"
# Note the PID, then:
taskkill /PID <pid> /F
```

### PostgreSQL service not running
```powershell
# As Administrator:
Start-Service postgresql-x64-17
```

### Database tables missing / schema errors
The server creates tables with `CREATE TABLE IF NOT EXISTS` on every startup — just restart the dev server. For a full reset:
```powershell
$env:PGPASSWORD = "cornerpos2024"
& "C:\Program Files\PostgreSQL\17\bin\dropdb.exe" -U postgres -h 127.0.0.1 cornerpos
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres -h 127.0.0.1 cornerpos
# Then restart: npm run dev
```

### Clearing demo data
Navigate to `/demo` in the running app and click **Clear**, or call the API:
```powershell
Invoke-RestMethod -Method POST http://localhost:3001/api/demo/clear
```

---

## Stopping / Restarting the Dev Server

The dev server (`npm run dev`) runs both Vite and Express via `concurrently`. Press **Ctrl+C** in the terminal to stop both.

PostgreSQL runs as a Windows background service and does **not** need to be manually stopped.
