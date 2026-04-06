# NexumDesk Backend

Express + TypeScript API for incident management, authentication, SLA tracking, admin configuration, and data export/import.

## Runtime

- Node.js 18+
- TypeScript 5+
- SQLite via `sqlite3`

## Start (Development)

```bash
cd backend
npm install
npm run dev
```

Default API base in current setup:

- `http://localhost:5000/api/v1`
- Health endpoint: `http://localhost:5000/health`

## Build and Start (Production Mode)

```bash
cd backend
npm run build
npm start
```

## Environment Variables

Supported and currently used:

- `PORT` (default in project setup: `5000`)
- `JWT_SECRET`
- `SQLITE_FILE` (for example `/data/nexumdesk.db`)
- `LOG_LEVEL` (`debug|info|warn|error`)
- `ALLOWED_ORIGINS` (comma-separated CORS allow-list)

Reference file: `backend/.env.example`

## API Surface (Current)

Base prefix: `/api/v1`

Authentication:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (auth required)
- `PUT /auth/change-password` (auth required)

Incidents and analytics:

- `GET /incidents`
- `POST /incidents` (auth + optional upload)
- `GET /incidents/:id` (auth)
- `PUT /incidents/:id` (auth)
- `DELETE /incidents/:id` (auth)
- `PUT /incidents/:id/assign` (auth)
- `POST /incidents/:id/complete` (auth)
- `POST /incidents/:id/reopen` (auth)
- `POST /incidents/:id/override` (auth)
- `POST /incidents/:id/accept` (auth)
- `GET /incidents/:id/sla-status` (auth)
- `POST /incidents/:id/confirm-response` (auth)
- `GET /incidents/:id/activities` (auth)
- `POST /incidents/:id/activities` (auth)
- `GET /incidents/stats/dashboard` (auth)
- `GET /incidents/stats/trend` (auth)
- `GET /incidents/stats/severity` (auth)
- `GET /incidents/categories` (auth)
- `GET /incidents/engineers/list` (auth)
- `POST /incidents/sla/check-breaches`

Notifications:

- `GET /incidents/notifications` (auth)
- `GET /incidents/notifications/unread-count` (auth)
- `PUT /incidents/notifications/:id/read` (auth)
- `DELETE /incidents/notifications` (auth)

Users:

- `GET /users` (admin)
- `POST /users` (admin)
- `GET /users/:id` (admin or self)
- `PUT /users/:id` (admin or self)
- `DELETE /users/:id` (admin)
- `POST /users/:id/reset-password` (admin)

Admin:

- `GET /admin/export`
- `POST /admin/import`
- `GET /admin/stats` (admin)
- `GET /admin/sla-policies` (manager/admin)
- `POST /admin/sla-policies` (admin)
- `PUT /admin/sla-policies/:id` (admin)
- `DELETE /admin/sla-policies/:id` (admin)
- `GET /admin/categories` (manager/admin)
- `POST /admin/categories` (admin)
- `PUT /admin/categories/:id` (admin)
- `DELETE /admin/categories/:id` (admin)
- `GET /admin/settings` (admin)
- `PUT /admin/settings` (admin)
- `PUT /admin/settings/:key` (admin)
- `GET /admin/business-hours` (manager/admin)
- `POST /admin/business-hours` (admin)
- `PUT /admin/business-hours` (admin)
- `DELETE /admin/business-hours/:id` (admin)

Uploads:

- `POST /uploads/upload` (auth)
- `GET /uploads`
- `DELETE /uploads/:id` (auth)

## Database and Data Operations

- SQLite DB file is created automatically if missing.
- Default location: `backend/data/nexumdesk.db` unless `SQLITE_FILE` is set.
- Backup export: `GET /api/v1/admin/export`
- Restore import: `POST /api/v1/admin/import`

## Operational Notes

- SLA monitor starts automatically with the server.
- Monitor interval is driven by setting `sla.check_interval_minutes`.
- Logger is centralized in `src/utils/logger.ts`.
- SLA and first-response status endpoints return percentage consumed and remaining time based on the active business-hours configuration when one is assigned to the SLA policy.

## Docker

From repository root:

```bash
docker-compose up --build
```

Backend container uses project port mapping `5000:5000`.
