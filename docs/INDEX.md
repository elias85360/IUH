# Documentation Index

- Overview and Quick Start: this file
- Security: `docs/SECURITY.md`
- Data Governance: `docs/DATA_GOVERNANCE.md`
- Observability: `docs/OBSERVABILITY.md`
- Deployment Guide: `docs/DEPLOYMENT.md`
- Upgrade Plan & Progress: `docs/UPGRADE_PLAN.md`
- Legacy Notes: `docs/legacy/README_PROJECT.md`, `docs/legacy/README_REPRISE.md`

## Quick Start (Dev)

- Backend
  - `cd backend && npm install && npm start`
- Frontend
  - `cd frontend && npm install && npm run dev`
- Infra (optional)
  - `cd infra && docker compose up -d keycloak redis prometheus grafana api`

## Key Endpoints

- API: `/api/devices`, `/api/metrics`, `/api/kpis`, `/api/timeseries`, `/api/diagnostics`
- Assets: `/api/assets/meta`
- Thresholds: `/api/settings/thresholds`, `/api/thresholds/effective`
- Exports: `/api/export.csv`, `/api/export.pdf`
- Metrics: `/metrics`
