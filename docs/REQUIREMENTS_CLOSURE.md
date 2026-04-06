# Requirements Closure Checklist

This document maps the repository implementation to the professor requirements.

## 1. CI/CD (Kubernetes, Terraform)

Implemented:

- **Kubernetes manifests**: `k8s/namespace.yaml`, `k8s/backend.yaml`, `k8s/frontend.yaml`
  - JWT_SECRET injected via `secretKeyRef` → `nexumdesk-secrets` Kubernetes Secret (never hardcoded)
  - Liveness and readiness probes defined for backend (`/health`) and frontend (`/`)
  - CPU and memory resource limits defined for both containers
  - Example secret manifest: `k8s/secret.example.yaml`
- **Terraform infra**: `infra/terraform/` — creates namespace, deployments, and services declaratively
- **CI pipeline**: `.github/workflows/ci.yml`
  - Triggers on push to `main` and all pull requests
  - Terraform format check + `validate` + init (no backend)
  - Kubernetes manifests dry-run with `kubectl apply --dry-run=client`
  - Backend: `npm ci` → `npm run build` → `npm run test:coverage`
  - Frontend: `npm ci` → `npm run build` → `npm run test:coverage`
- **CD pipeline**: `.github/workflows/cd.yml`
  - Triggers on push to `main` or manual dispatch (`workflow_dispatch`)
  - Builds and pushes Docker images to GHCR tagged with both `latest` and commit SHA
  - If `KUBE_CONFIG` secret is set: deploys to Kubernetes and waits for rollout
  - Optional: Terraform-based deploy when repo variable `DEPLOY_WITH_TERRAFORM=true`
  - Graceful skip when `KUBE_CONFIG` is not configured (images pushed, deploy skipped)

Required repository secrets for production deploy:

| Secret           | Purpose                                      |
|------------------|----------------------------------------------|
| `KUBE_CONFIG`    | Base64-encoded kubeconfig for target cluster |
| `JWT_SECRET`     | Injected as `TF_VAR_jwt_secret` for Terraform deploy |

## 4. Google Cloud CI/CD (Cloud Run and/or GKE)

Implemented for **GKE**:

- **Workflow**: `.github/workflows/cd-gcp-gke.yml`
- **Registry target**: Google Artifact Registry
- **Deploy target**: Google Kubernetes Engine (GKE)
- **Auth model**: Google GitHub Actions auth via Workload Identity Provider + Service Account
- **Kubernetes resources**:
  - `k8s/namespace.yaml`
  - `k8s/backend-pvc.yaml`
  - `k8s/backend.yaml`
  - `k8s/frontend.yaml`
- **Project documentation**: `docs/GCP_GKE_CICD.md`

Workflow behavior:

- authenticates to Google Cloud
- builds backend and frontend images
- pushes images to Artifact Registry
- obtains GKE credentials
- applies Kubernetes manifests
- injects `JWT_SECRET` as Kubernetes Secret
- updates deployments to the current commit image tags
- waits for rollout completion

Required GitHub repository variables:

| Variable | Purpose |
|----------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_REGION` | Artifact Registry region |
| `GAR_REPOSITORY` | Artifact Registry repository name |
| `GKE_CLUSTER` | GKE cluster name |
| `GKE_LOCATION` | GKE region or zone |

Required GitHub repository secrets:

| Secret | Purpose |
|--------|---------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GitHub OIDC federation target |
| `GCP_SERVICE_ACCOUNT` | Deploy service account email |
| `JWT_SECRET` | Backend runtime JWT secret |

## 2. Unit Tests (at least 80%)

Backend test suite (`backend/src/**/*.test.ts`):

| Test file                        | Module under test         | Coverage focus                              |
|----------------------------------|---------------------------|---------------------------------------------|
| `issCalculator.test.ts`          | `issCalculator.ts`        | ISS formula, SLA deadline, override guards  |
| `slaMonitor.test.ts`             | `slaMonitor.ts`           | Scheduler lifecycle, interval reschedule    |
| `tssCalculator.test.ts`          | `tssCalculator.ts`        | TSS formula, impact boost, severity mapping |
| `autoAssignEngine.test.ts`       | `autoAssignEngine.ts`     | Point constants, points limit resolution    |

Coverage configuration (`backend/vitest.config.ts`):
- Provider: v8
- Include: `issCalculator.ts`, `slaMonitor.ts`, `tssCalculator.ts`, `autoAssignEngine.ts`
- Thresholds: **80% lines / functions / branches / statements**
- Command: `cd backend && npm run test:coverage`

Frontend test suite (`frontend/src/**/*.test.ts`):

| Test file          | Module under test | Coverage focus                             |
|--------------------|-------------------|--------------------------------------------|  
| `format.test.ts`   | `format.ts`       | Date/duration formatting, NDI, normalizers |

Coverage configuration (`frontend/vitest.config.ts`):
- Provider: v8
- Include: `format.ts`
- Thresholds: **80% lines / functions / branches / statements**
- Command: `cd frontend && npm run test:coverage`

CI executes both coverage commands and fails the pipeline if thresholds are not met.

## 3. Complete Documentation

| File                           | Content                                                                 |
|--------------------------------|-------------------------------------------------------------------------|
| `README.md`                    | Project overview, features, quick-start links                           |
| `docs/INDEX.md`                | Documentation map and reading order                                     |
| `docs/ARCHITECTURE.md`         | System topology, backend/frontend composition, auth flow, data model, ISS/TSS scoring engines, auto-assign algorithm |
| `docs/DEPLOYMENT.md`           | Docker Compose, K8s, Terraform, CI/CD reference, rollback, monitoring   |
| `docs/QUICKSTART.md`           | Fast local setup, API smoke tests, build validation                     |
| `docs/REPORTS.md`              | Manager Reports page: KPIs, charts, PDF/Excel export                    |
| `docs/TROUBLESHOOTING.md`      | Common runtime and setup issues with concrete fixes                     |
| `docs/REQUIREMENTS_CLOSURE.md` | This file — requirement-to-implementation traceability                  |

Key technical topics documented in `ARCHITECTURE.md`:
- ISS (Incident Severity Score) formula, weight tables, severity/priority/SLA mapping
- TSS (Technical Severity Score) formula, impact boost table, tier-routing logic
- Auto-assign engine: tier selection, capacity/points system, fallback order, approval flow, all configurable system settings keys

## Verification Commands

Run locally before submission:

```bash
# Backend build + coverage
cd backend
npm ci
npm run build
npm run test:coverage

# Frontend build + coverage
cd ../frontend
npm ci
npm run build
npm run test:coverage
```

## Notes

- Set a strong `JWT_SECRET` environment variable before any production deployment.
- For Kubernetes, inject `JWT_SECRET` via a Kubernetes Secret mounted as an environment variable on the backend pod.
- The SQLite database file is at `backend/data/nexumdesk.db` by default; use a persistent volume in container deployments.
