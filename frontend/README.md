# NexumDesk Frontend

React + Vite client for NexumDesk incident management workflows.

## Runtime

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Axios + React Router

## Start (Development)

```bash
cd frontend
npm install
npm run dev
```

Current dev URL:

- `http://localhost:5001`

## Build

```bash
cd frontend
npm run build
```

Preview built app:

```bash
npm run preview
```

## Environment Variables

Used in the current code:

- `VITE_API_URL` (for example `http://localhost:5000/api/v1`)

If `VITE_API_URL` is not set, frontend defaults to `http://localhost:5000/api/v1`.

## Key Frontend Areas

- Auth pages: `src/pages/Login.tsx`, `src/pages/Register.tsx`
- Role-aware app shell and routes: `src/App.tsx`
- Incident workflows: `src/pages/Incidents.tsx`, `src/pages/IncidentDetailsPage.tsx`, `src/pages/CreateIncidentPage.tsx`
- Admin config pages: SLA, categories, system settings

## API Client Notes

- Central client: `src/services/api.ts`
- Attaches JWT from `localStorage` key `nexum_token`
- Handles 401 by clearing auth storage

## UI and Performance Baseline

- Vite manual chunking is configured in `vite.config.ts` for `react`, `router`, `charts`, and `axios`.
- Shared styling and utility classes are defined in `src/index.css`.
- Incident read/unread tracking is centralized in `src/hooks/useReadIncidents.ts`.
- SLA and response-time cards render remaining time from backend business-hours calculations rather than wall-clock fallbacks.

## Docker

From repository root:

```bash
docker-compose up --build
```

Frontend is mapped to `http://localhost:5001` in current compose setup.
