# Google Cloud GKE CI/CD

This document covers the CI/CD flow for deploying NexumDesk to **Google Kubernetes Engine (GKE)** using **GitHub Actions** and **Artifact Registry**.

Project used for the lab:

- `project-77af9e0c-c580-4f02-96a`

## What This Flow Does

Workflow file:

- `.github/workflows/cd-gcp-gke.yml`

On push to `main` or manual run, the workflow:

1. Authenticates to Google Cloud
2. Builds backend and frontend images
3. Pushes them to Artifact Registry
4. Connects to GKE
5. Applies Kubernetes manifests
6. Applies Ingress for frontend + backend routing
7. Updates deployments to the new image tags
8. Waits for rollout completion

## Target Platform

- Google Cloud
- Artifact Registry
- Google Kubernetes Engine (GKE)
- GitHub Actions

## Required GitHub Repository Variables

Add these in GitHub:

- `GCP_PROJECT_ID`
  - value: `project-77af9e0c-c580-4f02-96a`
- `GCP_REGION`
  - example: `europe-west1`
- `GAR_REPOSITORY`
  - example: `nexumdesk`
- `GKE_CLUSTER`
  - your GKE cluster name
- `GKE_LOCATION`
  - zone or region of the cluster, for example `europe-west1-b`

## Required GitHub Repository Secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
  - full Workload Identity Provider resource name
- `GCP_SERVICE_ACCOUNT`
  - deploy service account email
- `JWT_SECRET`
  - backend application JWT secret

## Google Cloud Services To Enable

Enable these APIs in the Google Cloud project:

- Artifact Registry API
- Kubernetes Engine API
- IAM Credentials API
- Cloud Resource Manager API

Example:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  container.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=project-77af9e0c-c580-4f02-96a
```

## Artifact Registry Setup

Create a Docker repository once:

```bash
gcloud artifacts repositories create nexumdesk \
  --repository-format=docker \
  --location=europe-west1 \
  --description="NexumDesk images" \
  --project=project-77af9e0c-c580-4f02-96a
```

## GKE Cluster Setup

Example cluster creation:

```bash
gcloud container clusters create-auto nexumdesk-cluster \
  --region=europe-west1 \
  --project=project-77af9e0c-c580-4f02-96a
```

After creation, use:

- `GKE_CLUSTER=nexumdesk-cluster`
- `GKE_LOCATION=europe-west1`

## IAM Requirements

The GitHub deploy identity needs enough access to:

- push images to Artifact Registry
- fetch GKE credentials
- deploy workloads to the cluster

Typical roles:

- `roles/artifactregistry.writer`
- `roles/container.developer`
- `roles/container.clusterViewer`
- `roles/iam.workloadIdentityUser`

Depending on your cluster and org policy, extra IAM roles may be needed.

## Kubernetes Notes

The workflow deploys these manifests:

- `k8s/namespace.yaml`
- `k8s/backend-pvc.yaml`
- `k8s/backend.yaml`
- `k8s/frontend.yaml`
- `k8s/ingress.yaml`

The workflow also creates/updates the secret:

- `nexumdesk-secrets`

The backend uses a persistent volume claim for SQLite:

- `nexumdesk-sqlite-pvc`

The frontend is built with:

- `VITE_API_URL=/api/v1`

The GKE ingress routes:

- `/` -> frontend
- `/api` -> backend
- `/health` -> backend

## Deploy Trigger

Deployment starts when:

- code is pushed to `main`
- or `.github/workflows/cd-gcp-gke.yml` is run manually from GitHub Actions

## Verification

After deployment, verify:

```bash
kubectl get pods -n nexumdesk
kubectl get svc -n nexumdesk
kubectl rollout status deployment/nexumdesk-backend -n nexumdesk
kubectl rollout status deployment/nexumdesk-frontend -n nexumdesk