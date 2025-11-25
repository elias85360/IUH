# Environments

Ports and roles:

- Frontend (dev): http://localhost:5174 (Vite)
- Frontend (compose): http://localhost:8081 (nginx static)
- Backend API: http://localhost:4001 (host port; service port 4000)
- Keycloak: http://localhost:8080
- TimescaleDB: localhost:5432
- Redis: localhost:6379
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000

Dev profile (parity recommended):

- Vite proxies `/api`, `/metrics`, `/kienlab` to `VITE_API_PROXY_TARGET` (default `http://localhost:4001`); point it to `http://localhost:8081` to go through nginx
- Backend running in compose (`api`) with Timescale/Redis/Keycloak
- Frontend env (`frontend/.env`):
  - `VITE_API_PROXY_TARGET=http://localhost:4001`
  - `VITE_DATA_SOURCE=` (empty -> use backend API)
  - `VITE_MASTER_BASE=http://localhost:4001/api/v1` (only if using master mode; adjust if bypassing compose)

Prod (compose) profile:

- Frontend built into nginx image (`infra/nginx.Dockerfile`) exposed on 8081
- `api` with `RBAC_ENFORCE=1`, `TRUST_PROXY=true`
- Backend `KIENLAB_BASE=http://nginx/kienlab` to route via nginx proxy

Parity checklist:

- Same auth flow on 5174 and on http://localhost:8081
- Consistent `/api/*` path (set `VITE_API_PROXY_TARGET` to 8081 if you want to exercise nginx)
- Keycloak client has redirect URIs for both `http://localhost/*` and `http://localhost:5174/*`
