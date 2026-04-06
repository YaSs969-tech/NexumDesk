# NexumDesk Architecture

## System Overview

NexumDesk is a two-tier web application:

- Frontend: React + Vite (`frontend/`)
- Backend API: Express + TypeScript (`backend/`)
- Database: SQLite file managed by backend (`backend/data/nexumdesk.db` by default)

## Runtime Topology (Current Defaults)

```text
Browser
  -> Frontend (Vite): http://localhost:5001
  -> Backend API:     http://localhost:5000/api/v1
  -> Health:          http://localhost:5000/health
```

The frontend communicates with backend through Axios (`frontend/src/services/api.ts`) and sends JWT in `Authorization: Bearer <token>`.

## Backend Composition

Main entry points:

- `backend/src/index.ts` - server startup and SLA monitor bootstrap
- `backend/src/app.ts` - middleware, CORS, parsers, routes, global error handler
- `backend/src/routes/index.ts` - route mount points

Route groups:

- `auth` - registration, login, self profile, password change
- `incidents` - CRUD, assignment, completion, reopen, SLA status, analytics, notifications
- `users` - user management and profile updates with role checks
- `admin` - export/import, SLA policies, categories, settings, business-hour configs
- `uploads` - authenticated file upload and management

Cross-cutting backend concerns:

- Authentication middleware in `backend/src/middleware/auth.ts`
- SQLite migration and seed bootstrap in `backend/src/utils/sqlite.ts`
- SLA monitoring scheduler in `backend/src/utils/slaMonitor.ts`
- Centralized logger in `backend/src/utils/logger.ts`

## Frontend Composition

Core app shell and routing:

- `frontend/src/App.tsx`

Feature areas:

- Dashboard and role-specific dashboards
- Incident list/details/create pages
- Admin pages (SLA config, categories, system settings, users)
- Auth pages (`Login`, `Register`)

Frontend service layer:

- Axios instance and API helpers in `frontend/src/services/api.ts`

## Auth and Authorization Flow

1. User logs in via `POST /api/v1/auth/login` with email + password.
2. Backend signs a JWT and returns `access_token`.
3. Frontend stores token in `localStorage` (`nexum_token`).
4. Axios interceptor injects token into protected requests.
5. Backend middleware verifies token and loads user context.

Authorization is role-based (`ADMIN`, `MANAGER`, `ENGINEER`, `USER`) and enforced by route middleware plus controller checks.

## Data Model (Implemented Core)

Primary tables in the live schema:

- `users`
- `incidents`
- `incident_activities`
- `notifications`
- `sla_policies`
- `categories`
- `system_settings`
- `business_hour_configs`
- `business_hours`
- `business_hour_holidays`
- `audit_logs`

Additional tables exist for broader operations and compatibility in migrations:

- `services`
- `comments`
- `escalation_rules`
- `on_call_schedule`

## Background Processing

SLA monitor:

- Starts when backend starts.
- Reads interval from setting `sla.check_interval_minutes`.
- Periodically evaluates SLA breach state and notification output.
- SLA and response-time remaining values are computed from configured business hours, so timers pause outside working windows and resume on the next working period.

## Request/Response Conventions

Successful responses usually follow:

```json
{ "success": true, "data": { "...": "..." } }
```

Error responses usually follow:

```json
{ "success": false, "error": "message" }
```

Some endpoints return `{ error: { message: "..." } }` depending on route/controller implementation.

## Performance Characteristics

Current baseline:

- Single backend process
- SQLite local file storage with WAL journal mode (enabled on startup for improved concurrent reads)
- Indexes on `incidents(status, created_at, created_by, assigned_to, sla_deadline)` and `incident_activities(incident_id, created_at)` for query performance
- Frontend production build uses manual chunk splitting for major libraries
- API timeout at frontend client level is 15 seconds

## Security Baseline

- Password hashing with bcrypt
- JWT-based session auth
- Configurable CORS allow-list via `ALLOWED_ORIGINS`
- `x-powered-by` disabled on Express app
- Request payload size limits enabled in JSON and URL-encoded parsers

---

## Incident Scoring Engines

### ISS (Incident Severity Score)

Source: `backend/src/utils/issCalculator.ts`

The ISS calculator computes a weighted numeric score from three inputs that drives the **initial severity and priority** of every new incident.

**Formula:**

```
ISS = (urgencyValue × urgencyWeight)
    + (impactValue  × impactWeight)
    + (categoryRisk × categoryWeight)
```

Default weights: urgency `0.4`, impact `0.35`, category `0.25`.

**Input value tables:**

| Urgency  | Value |   | Impact       | Value |   | Category | Risk |
|----------|-------|---|--------------|-------|---|----------|------|
| CRITICAL | 4     |   | ORGANIZATION | 5     |   | SECURITY | 5    |
| HIGH     | 3     |   | DEPARTMENT   | 3     |   | NETWORK  | 4    |
| MEDIUM   | 2     |   | SINGLE_USER  | 1     |   | HARDWARE | 3    |
| LOW      | 1     |   |              |       |   | SOFTWARE | 2    |
|          |       |   |              |       |   | OTHER    | 2    |



 Priority → SLA:**

| Priority | SLA Hours |
|----------|-----------|
| P1       | 4 h       |
| P2       | 8 h       |
| P3       | 24 h      |
| P4       | 72 h      |

Managers and Admins may override the calculated severity or priority through the Incident Details page. Every override is logged in `incident_activities` with the reason provided.

---

### TSS (Technical Severity Score)

Source: `backend/src/utils/tssCalculator.ts`

The TSS calculator produces a score that determines **which engineer tier** is required to handle the incident.

**Formula:**

```
TSS = min(risk + impactBoost, 5)   when impactAffects = true
TSS = risk                          when impactAffects = false
```

The `risk` value (1–5) and whether `impactAffects` the score are read from the subcategory's system configuration.

**Impact boost defaults:**

| Impact       | Boost |
|--------------|-------|
| SINGLE_USER  | +0    |
| DEPARTMENT   | +0.5  |
| ORGANIZATION | +1.0  |

**TSS → Severity → Required Tier (default thresholds):**

| TSS   | Severity | Required Tier |
|-------|----------|---------------|
| = 5   | CRITICAL | SENIOR        |
| ≥ 4   | HIGH     | MID           |
| ≥ 3   | MEDIUM   | JUNIOR        |
| < 3   | LOW      | JUNIOR        |

Thresholds are configurable in System Settings. The required tier field is stored on the incident and displayed in Incident Details.

---

## Auto-Assign Engine

Source: `backend/src/utils/autoAssignEngine.ts`

The engine automatically selects the most suitable available engineer when an incident is created (or when a Manager triggers a manual assign). The selection algorithm runs as follows:

1. **Severity points cost** — Each severity maps to a point cost (defaults: SEV-1=60, SEV-2=35, SEV-3=20, SEV-4=10). Costs are configurable in System Settings.

2. **Tier resolution** — The required primary tier for the incident's severity is read from `system_settings` (defaults match TSS output: SEV-1→SENIOR, SEV-2→MID, SEV-3/4→JUNIOR).

3. **Capacity check** — Each engineer carries a live `load_points` value (sum of points of all their active incidents). An engineer is **eligible** only if `load_points + incidentCost ≤ points_limit`.

4. **Fallback tiers** — If no engineer in the primary tier is eligible, the engine tries the configured fallback tier order for that severity.

5. **Load-balanced selection** — Among all eligible engineers, the one with the **lowest load percentage** (`load_points / points_limit`) is selected.

**Default points limits per tier:**

| Tier   | Default Limit |
|--------|---------------|
| JUNIOR | 100 pts       |
| MID    | 160 pts       |
| SENIOR | 240 pts       |

**Approval flow:**

When `auto_assign.require_approval = true` (System Settings), the assignment lands as `PENDING_APPROVAL`. A Manager must confirm or change the engineer via the **Engineers Overview** tab in Incident Details. Confirming is logged as an `APPROVED` activity entry.

**Configurable system settings keys:**

| Key                              | Purpose                                  |
|----------------------------------|------------------------------------------|
| `auto_assign.enabled`            | Master on/off switch                     |
| `auto_assign.require_approval`   | Require manager confirmation             |
| `auto_assign.enable_junior/mid/senior` | Enable/disable tier from pool      |
| `auto_assign.limit_junior/mid/senior`  | Override default points limits     |
| `auto_assign.fallback_sev1..4`   | Fallback tier order per severity         |
| `auto_assign.severity_points_sev1..4` | Override point costs per severity  |
