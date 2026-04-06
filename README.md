# NexumDesk

NexumDesk is an incident management platform with a TypeScript/Express backend and a React/Vite frontend.

## What You Get

- Incident lifecycle management: create, assign, track, reopen, complete
- Role-based access for `ADMIN`, `MANAGER`, `ENGINEER`, `USER`
- SLA monitoring with scheduled checks
- Admin configuration for SLA policies, categories, business hours, and settings
- Local SQLite persistence with export/import endpoints for backup and migration

## Repository Structure

```text
backend/      Express + TypeScript API
frontend/     React + Vite UI
docs/         Operational and architecture documentation
docker-compose.yml
```

## Quick Start

### Option 1: Docker Compose

```bash
docker-compose up --build
```

Open:

- Frontend: `http://localhost:5001`
- Backend API base: `http://localhost:5000/api/v1`
- Backend health: `http://localhost:5000/health`

Stop:

```bash
docker-compose down
```

### Option 2: Local Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5001`.

## Environment

Main variables used in the current codebase:

- `PORT` (backend port, default `5000` in current setup)
- `JWT_SECRET`
- `SQLITE_FILE`
- `LOG_LEVEL` (`debug|info|warn|error`)
- `ALLOWED_ORIGINS` (comma-separated)
- `VITE_API_URL` (frontend API base)

See `.env.example` and `backend/.env.example`.

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

## Unit Testing and Coverage

Backend:

```bash
cd backend
npm test
npm run test:coverage
```

Frontend:

```bash
cd frontend
npm test
npm run test:coverage
```

Both packages enforce a minimum `80%` threshold for:

- lines
- functions
- branches
- statements

## CI/CD and Distributed Deployment Baseline

This repository includes a baseline for requirement 1:

- CI workflow: `.github/workflows/ci.yml`
- CD workflow: `.github/workflows/cd.yml`
- Google Cloud GKE CD workflow: `.github/workflows/cd-gcp-gke.yml`
- Kubernetes manifests: `k8s/`
- Terraform (Kubernetes resources): `infra/terraform/`

CI runs on pull requests and pushes to `main`:

- install dependencies
- build backend and frontend
- run unit tests with coverage thresholds

CD runs on push to `main` (or manual trigger):

- build and push Docker images to GHCR
- apply Kubernetes manifests when `KUBE_CONFIG` secret is configured

Google Cloud GKE CD runs on push to `main` (or manual trigger):

- authenticate to Google Cloud via GitHub Actions
- build and push images to Artifact Registry
- deploy to GKE with `kubectl`

## Documentation Index

- `docs/INDEX.md` - Main documentation entry point and reading order
- `docs/QUICKSTART.md` - Local and Docker startup flow
- `docs/ARCHITECTURE.md` - System structure and data flow
- `docs/DEPLOYMENT.md` - Production deployment checklist
- `docs/REPORTS.md` - Manager Reports metrics, filters, and export behavior
- `docs/GCP_GKE_CICD.md` - Google Cloud GKE CI/CD setup for laboratory requirement 4
- `docs/TROUBLESHOOTING.md` - Common issues and fixes
- `docs/REQUIREMENTS_CLOSURE.md` - Evidence checklist for CI/CD, testing, and documentation requirements
- `backend/README.md` - Backend runtime and API notes
- `frontend/README.md` - Frontend runtime and build notes

## Current Technical Baseline

- Backend and frontend compile successfully via `npm run build`
- Backend uses centralized logger and safer HTTP defaults (`x-powered-by` disabled, request size limits, configurable CORS)
- Frontend uses chunk-splitting in Vite for smaller production bundles
- SLA and first-response consumption are calculated against configured business hours for both percentage consumed and time remaining displays
- Frontend incident read/unread state is centralized through a shared hook to reduce duplicated localStorage logic

## License

MIT
