# Environments

Ports and roles:

- Frontend (dev): http://localhost:5174 (Vite)
- Frontend (prod): http://localhost (nginx static)
- Backend API: http://localhost:4001 (host published by compose), service port 4000
- Keycloak: http://localhost:8080
- TimescaleDB: localhost:5432
- Redis: localhost:6379
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000

Dev profile (parity recommended):

- Frontend Vite proxies `/api`, `/metrics`, `/kienlab` to `http://localhost` (nginx)
- Backend running in compose (`api`) with Timescale/Redis/Keycloak
- Frontend env (`frontend/.env`):
  - `VITE_API_PROXY_TARGET=http://localhost`
  - `VITE_DATA_SOURCE=` (empty → use backend API)
  - `VITE_MASTER_BASE=/kienlab/api` (only if using master mode)

Prod (compose) profile:

- Frontend built into nginx image (`infra/nginx.Dockerfile`)
- `api` with `RBAC_ENFORCE=1`, `TRUST_PROXY=true`
- Backend `KIENLAB_BASE=http://nginx/kienlab` to route via nginx proxy

Parity checklist:

- Same auth flow on 5174 and on root host
- Both use `/api/*` via nginx (no direct Kienlab calls in dev)
- Keycloak client has redirect URIs for both `http://localhost/*` and `http://localhost:5174/*`

