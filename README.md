# IoT Dashboard

Full-stack IoT monitoring dashboard: React + Vite frontend, Node.js (Express + Socket.IO) backend, Nginx reverse proxy, Keycloak (OIDC/RBAC), optional TimescaleDB/Redis, Prometheus/Grafana, flexible ingestion (mock/http/ws/mqtt/kienlab).

## Features
- AuthN/AuthZ: Keycloak OIDC + roles (viewer/analyst/admin), API key, optional HMAC with anti-replay.
- Data plane: ingestion adapters (mock, HTTP poll, WebSocket, MQTT, Kienlab HTTP), live Socket.IO, ring buffers with pre-agg, optional TimescaleDB mirror/read, Redis cache.
- Alerting: thresholds with hysteresis, email (SMTP), Slack/webhook routing, PDF/CSV exports.
- Observability: /metrics Prometheus, optional OpenTelemetry, dashboards via Grafana.
- Security: helmet, rate limiting, CORS allowlist, audit log, nonce store for HMAC.

## Architecture (overview)
```
Browser (React/Vite SPA)
          |
          | HTTPS/WS
          v
+-------------------------------+
| Nginx reverse proxy (80/443)  |
| - serves SPA                  |
| - /api -> API (4000)          |
| - /socket.io -> API           |
| - /kienlab -> external target |
+-------------------------------+
          |
          v
+-------------------------------+
| API (Express + Socket.IO)     |
| - RBAC/OIDC, API key, HMAC    |
| - /api, /metrics, /socket.io  |
+-------------------------------+
   | ingestion          | storage/cache/obs
   v                    v
+-------------------+   +------------------+
| Ingestion sources |   | TimescaleDB (opt)|
| mock/http/ws/mqtt |   | Redis (cache)    |
| kienlab           |   | Prometheus ->    |
+-------------------+   | Grafana          |
                        +------------------+
             Keycloak (OIDC) for tokens
```

## Repository layout
- `frontend/` — React/Vite app (routes, state, services API/OIDC/Socket.IO, charts).
- `backend/` — Express API, ingestion sources, alerts, metrics, security, Socket.IO.
- `infra/` — docker-compose stack (nginx, api, keycloak, redis, db, prometheus, grafana) + configs.
- `docs/` — architecture and module docs: `ARCHITECTURE.md`, `BACKEND.md`, `FRONTEND.md`, `API.md`, `INFRA.md`.

## Quickstart (Compose)
```bash
cd infra
docker compose up -d --build
```
Services: frontend via nginx http://localhost, API http://localhost:4001, Keycloak http://localhost:8080, Prometheus http://localhost:9090, Grafana http://localhost:3000 (admin/admin).

## Quickstart (Dev local)
```bash
cd infra && docker compose up -d db redis keycloak api nginx
cd ../frontend && npm install && npm run dev
```
- Frontend dev: http://localhost:5174 (proxied via nginx).
- API served by backend container on 4000 (published 4001).

## Minimal env hints
- Backend: `RBAC_ENFORCE=1`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `API_KEY` (if allowed), `DATA_SOURCE`, `KIENLAB_*`, `DATABASE_URL` (Timescale), `REDIS_URL`, `SMTP_*`, `ALERTS_*`, `METRICS_API_KEY`.
- Frontend: `VITE_REQUIRE_AUTH`, `VITE_OIDC_ISSUER_URL`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`, optional `VITE_API_BASE`, `VITE_API_KEY`, `VITE_API_HMAC_KEY_ID/SECRET`.

## Docs
See `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/API.md`, `docs/INFRA.md` for full module details and operations.
