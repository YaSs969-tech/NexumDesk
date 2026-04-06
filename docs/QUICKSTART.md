# NexumDesk Quick Start

This guide gets the full stack running locally with the current repository defaults.

## Prerequisites

- Node.js 18+
- npm 9+
- Docker Desktop (optional, for Compose workflow)

## Option A: Docker Compose

From repository root:

```bash
docker-compose up --build
```

Open:

- Frontend: `http://localhost:5001`
- Backend health: `http://localhost:5000/health`
- Backend API base: `http://localhost:5000/api/v1`

Stop:

```bash
docker-compose down
```

## Option B: Local Development

Terminal 1 (backend):

```bash
cd backend
npm install
npm run dev
```

Terminal 2 (frontend):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5001`.

## Minimal Verification Flow

1. Register user at `/register`.
2. Login at `/login`.
3. Create an incident at `/incidents/new`.
4. Check incident list at `/incidents`.
5. Confirm backend health at `http://localhost:5000/health`.

## API Smoke Test (PowerShell)

Register:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/v1/auth/register" -ContentType "application/json" -Body '{"username":"john_doe","email":"john@example.com","password":"JohnPass123!","full_name":"John Doe"}'
```

Login:

```powershell
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/v1/auth/login" -ContentType "application/json" -Body '{"email":"john@example.com","password":"JohnPass123!"}'
$token = $login.data.access_token
```

List incidents:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:5000/api/v1/incidents" -Headers @{ Authorization = "Bearer $token" }
```

## Build Validation

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

## Common First-Run Issues

- `EADDRINUSE` on backend port: another process is already using `5000`.
- `401` after login: verify `nexum_token` exists in browser storage.
- Upload or DB errors: ensure `backend/data` is writable.

For full diagnostics see `docs/TROUBLESHOOTING.md`.
