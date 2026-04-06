# NexumDesk Deployment Guide

This guide describes how to run NexumDesk in local and production-like environments using the current repository.

## Deployment Modes

- Local development with Node + Vite
- Local containerized stack with Docker Compose
- Single-host production-like deployment with Docker Compose

## 1. Local Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Access:

- Frontend: `http://localhost:5001`
- Backend API: `http://localhost:5000/api/v1`
- Backend health: `http://localhost:5000/health`

## 2. Docker Compose (Current Project Baseline)

From repository root:

```bash
docker-compose up --build
```

Service mappings in current compose file:

- Backend: `5000:5000`
- Frontend: `5001:5001`

Stop:

```bash
docker-compose down
```

Logs:

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

## 3. Production-Like Compose Checklist

For a hardened deployment, apply these before going live:

1. Set strong `JWT_SECRET`.
2. Set `NODE_ENV=production`.
3. Restrict `ALLOWED_ORIGINS` to public frontend domain.
4. Persist DB volume to durable host path.
5. Put reverse proxy (Nginx/Caddy/Traefik) in front for TLS and routing.

Example backend environment:

```env
NODE_ENV=production
PORT=5000
JWT_SECRET=replace_with_long_random_secret
SQLITE_FILE=/data/nexumdesk.db
LOG_LEVEL=info
ALLOWED_ORIGINS=https://helpdesk.example.com
```

Example frontend environment:

```env
VITE_API_URL=https://api.example.com/api/v1
```

## 4. Reverse Proxy Pattern

Recommended public routing:

- `https://helpdesk.example.com` -> frontend service
- `https://api.example.com` -> backend service (`/api/v1` + `/health`)

Benefits:

- TLS termination
- Stable public domains
- Better cache and compression control

## 5. Backup and Restore Operations

Export full database snapshot:

```bash
curl http://localhost:5000/api/v1/admin/export > nexumdesk-backup.json
```

Restore snapshot:

```bash
curl -X POST http://localhost:5000/api/v1/admin/import \
  -H "Content-Type: application/json" \
  -d @nexumdesk-backup.json
```

Recommended cadence:

- Daily backup in non-dev environments
- Keep off-host copies of backup files

## 6. Pre-Release Validation

Run before deployment:

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

Smoke checks after deploy:

1. `GET /health` returns `{ "status": "ok" }`
2. Login works from frontend
3. Incident list and create flow work
4. Admin settings page loads for admin role

## 7. Rollback Strategy

Simple rollback approach:

1. Keep a known-good image tag (or git commit).
2. Re-deploy stack from previous tag/commit.
3. Restore last known-good database backup if data migration caused failure.

## 8. Observability Baseline

Current state:

- Backend emits structured timestamped logs through `src/utils/logger.ts`.
- Compose logs are sufficient for first-line diagnostics.

Recommended production add-ons:

- Centralized log shipping
- HTTP access logs at reverse proxy
- Uptime probe for `/health`

## 9. Kubernetes Deployment (Requirement 1)

The repository provides ready-to-apply manifests in `k8s/`:

- `k8s/namespace.yaml`
- `k8s/backend.yaml`
- `k8s/frontend.yaml`
- `k8s/secret.example.yaml` — example Secret for `JWT_SECRET`

**Before applying**, create the JWT secret:

```bash
kubectl apply -f k8s/namespace.yaml

# Option A – from file (fill in your real value first)
kubectl apply -f k8s/secret.example.yaml

# Option B – imperative (recommended for CI)
kubectl create secret generic nexumdesk-secrets \
  --from-literal=jwt-secret="YourRealJWTSecretHere" \
  -n nexumdesk
```

Then apply the workloads:

```bash
kubectl apply -f k8s/
```

Important:

1. Replace placeholder image names (`ghcr.io/your-org/...`) with your real registry tags.
2. `JWT_SECRET` is injected via a `secretKeyRef` — never stored as plaintext in the manifest.
3. Backend and frontend containers have liveness/readiness probes and CPU/memory resource limits.
4. Use a persistent `PersistentVolumeClaim` instead of `emptyDir` for SQLite data in production (see comment in `k8s/backend.yaml`).

## 10. Terraform Deployment (Requirement 1)

Terraform files are in `infra/terraform/` and create:

- namespace
- backend deployment + service
- frontend deployment + service

Example usage:

```bash
cd infra/terraform
terraform init
terraform plan -var="backend_image=ghcr.io/<owner>/nexumdesk-backend:latest" -var="frontend_image=ghcr.io/<owner>/nexumdesk-frontend:latest"
terraform apply
```

## 11. CI/CD Workflows (Requirement 1)

### CI

Workflow: `.github/workflows/ci.yml`

- runs on pull request and push to `main`
- installs dependencies in backend/frontend
- runs build
- runs tests with coverage thresholds

### CD

Workflow: `.github/workflows/cd.yml`

- builds and pushes Docker images to GHCR
- deploys to Kubernetes if `KUBE_CONFIG` repository secret is set

Required repo secret for auto-deploy:

- `KUBE_CONFIG` as base64-encoded kubeconfig

## 12. Unit Test Coverage (Requirement 2)

Coverage commands:

```bash
cd backend
npm run test:coverage

cd ../frontend
npm run test:coverage
```

Both packages enforce minimum global thresholds of `80%` for:

- lines
- functions
- branches
- statements

### Database locked
SQLite doesn't support concurrent writes well. If you see "database is locked":
- Use PostgreSQL for production
- Or run in single-process mode (avoid clustering)

---

## Monitoring Checklist

- [ ] API response times < 500ms (p95)
- [ ] Error rate < 0.1%
- [ ] Database file size < 1GB
- [ ] JWT token expiry working
- [ ] CORS headers correct
- [ ] SSL/TLS certificate valid
- [ ] Backups running on schedule

---

## References

- [README.md](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- Docker docs: https://docs.docker.com/
- Kubernetes docs: https://kubernetes.io/docs/
