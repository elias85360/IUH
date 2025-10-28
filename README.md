# IoT Dashboard – Full Stack

React + Vite frontend, Node.js backend (Express + Socket.IO), Nginx, Keycloak (OIDC), TimescaleDB, Redis, Prometheus, Grafana, Mosquitto.

Quick links:

- Dev setup: `docs/SETUP_DEV.md`
- Compose (prod‑like): `docs/SETUP_COMPOSE.md`
- API reference: `docs/API.md`
- Security: `docs/SECURITY.md`
- Observability: `docs/OBSERVABILITY.md`, `docs/PROMETHEUS.md`, `docs/GRAFANA.md`
- Architecture: `docs/ARCHITECTURE.md`

## Quickstart (Compose)

```
cd infra
docker compose up -d --build
```

Open:

- Frontend (nginx): http://localhost
- Backend (published): http://localhost:4001
- Keycloak: http://localhost:8080
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

## Quickstart (Dev)

```
cd infra && docker compose up -d db redis keycloak api nginx
cd ../frontend && npm install && npm run dev
```

Open http://localhost:5174. Dev is aligned with prod via nginx proxy.

## ASCII Architecture

```
             ┌──────────────────────────────────┐
             │              Browser             │
             │  React/Vite app (dev 5174)       │
             └───────────────┬──────────────────┘
                             │ HTTP/WS
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                          Nginx (80/443)                      │
│  • Serves static SPA                                         │
│  • /api, /metrics, /socket.io  →  api:4000                   │
│  • /kienlab → external Kienlab endpoint                      │
└───────────────┬──────────────────────┬───────────────────────┘
                │                      │
                │                      │
                ▼                      ▼
     ┌─────────────────┐       ┌───────────────────────┐
     │   API service   │       │   Kienlab (external)  │
     │  Express + S.IO │       └───────────────────────┘
     │  /api, /metrics │
     └──┬──────────┬───┘
        │          │
        │          │
        ▼          ▼
┌─────────────┐  ┌─────────────┐      ┌───────────────┐
│ TimescaleDB │  │   Redis     │◀────▶│  Prometheus   │
│   (db)      │  │  cache/nonce│      │   (scrape)    │
└─────────────┘  └─────────────┘      └─────┬─────────┘
                                            │
                                            ▼
                                     ┌─────────────┐
                                     │  Grafana    │
                                     │ dashboards  │
                                     └─────────────┘

Keycloak (OIDC) authenticates users; Mosquitto and py‑forecast are optional services.
```

## What’s Inside

- Frontend: `frontend/` (Vite config, OIDC, proxies)
- Backend: `backend/` (API, RBAC/HMAC, metrics)
- Infra: `infra/` (compose, nginx.conf, Keycloak realm, Prometheus/Grafana)
- Docs: `docs/` (how‑tos, reference, runbook, ADRs)

See the docs folder for full details.
