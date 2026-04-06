# Manager Reports Guide

This document describes how the Reports page works for MANAGER role users.

## Route and Access

- Route: /reports
- Visible in sidebar only for MANAGER users.
- Data source: backend incidents endpoint.

## Data Source

The page loads incidents through:

- GET /api/v1/incidents?limit=5000&page=1

All visual elements are computed from real incident data.

## Time Filters

Supported period filters:

- Today
- 7 days
- 30 days
- 3 months
- Custom

Custom mode enables Start and End date inputs and recalculates all metrics/charts/tables based on selected range.

## KPIs

Current KPI cards include:

- Avg. Resolution Time
- Team Workload Distribution

Values are recalculated from filtered incident set and compared to previous period.

## Charts and Tables

The page renders:

- Resolved incidents per engineer (bar)
- Incidents by priority (donut)
- Created vs Resolved trend (line-style SVG)
- Reopen rate per engineer (bar)
- Detailed performance per engineer (table)

## Export

### PDF Export

Implementation:

- Library: jspdf + jspdf-autotable
- Output: direct download .pdf
- Content: period, summary metrics, engineer table

### Excel Export

Implementation:

- Library: xlsx
- Output: direct download .xlsx
- Sheets:
  - Summary
  - Engineer Performance

## Technical Notes

- Frontend file: frontend/src/pages/ManagerReports.tsx
- Route wiring: frontend/src/App.tsx
- Sidebar item: frontend/src/components/Sidebar.tsx

## Validation

Run:

```bash
cd frontend
npm run build
```

The build must pass before release.
