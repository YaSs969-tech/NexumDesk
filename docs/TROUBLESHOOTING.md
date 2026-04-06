# NexumDesk Troubleshooting

Use this guide for the most common runtime and setup problems in the current project.

## 1. Backend Will Not Start

Symptom:

- `Error: listen EADDRINUSE ... :::5000`

Cause:

- Port `5000` is already used by another process.

Fix (PowerShell):

```powershell
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

Then restart backend:

```bash
cd backend
npm run dev
```

## 2. Frontend Cannot Reach API

Symptom:

- UI shows network/CORS errors.

Checklist:

1. Backend is healthy at `http://localhost:5000/health`.
2. `VITE_API_URL` points to `http://localhost:5000/api/v1`.
3. Backend `ALLOWED_ORIGINS` includes frontend origin (`http://localhost:5001` in current setup).

## 3. 401 Unauthorized on Protected Endpoints

Checklist:

1. Login succeeded and returned `access_token`.
2. Browser storage has `nexum_token`.
3. Request header includes `Authorization: Bearer <token>`.
4. Backend `JWT_SECRET` did not change after token issuance.

## 4. 403 Forbidden on Admin or Manager Features

Cause:

- Role mismatch.

Current role requirements:

- User management create/delete/reset-password: `ADMIN`
- Admin settings update routes: `ADMIN`
- SLA/category/business-hours read routes: `MANAGER` or `ADMIN`

## 5. SQLite File Issues

Symptom:

- `SQLITE_CANTOPEN`, write failures, or missing data.

Fix:

1. Ensure `backend/data` exists.
2. Ensure process has write permission.
3. Check `SQLITE_FILE` path correctness.

Dev reset (data destructive):

```powershell
Remove-Item .\backend\data\nexumdesk.db -Force
```

Restart backend to recreate schema.

## 6. Docker Stack Not Available on Expected Ports

Current compose mappings:

- Backend: `5000:5000`
- Frontend: `5001:5001`

If inaccessible:

```bash
docker-compose ps
docker-compose logs -f backend
docker-compose logs -f frontend
```

## 7. Build Fails

Backend build:

```bash
cd backend
npm run build
```

Frontend build:

```bash
cd frontend
npm run build
```

If dependency errors appear, run a clean install in that package directory:

```bash
npm install
```

## 8. Slow API Responses

Quick checks:

1. Verify backend is not running multiple duplicate instances.
2. Check DB file size and disk health.
3. Review logs for repeated errors or long-running operations.

## 9. Quick Recovery Procedure

If local setup is inconsistent:

1. Stop running Node and Docker processes.
2. Rebuild backend and frontend.
3. Restart backend, then frontend.
4. Validate `/health`, then login flow.

## 10. Useful Commands

Health:

```bash
curl http://localhost:5000/health
```

Compose logs:

```bash
docker-compose logs -f
```

Backend build:

```bash
cd backend && npm run build
```

Frontend build:

```bash
cd frontend && npm run build
```
