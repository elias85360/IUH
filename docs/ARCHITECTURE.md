# Architecture

Services (docker-compose):

- nginx
  - Serves frontend static build and terminates HTTP(S)
  - Proxies `/api` and `/metrics` to `api:4000`
  - Proxies `/socket.io` (websocket) to `api:4000`
  - Proxies `/kienlab/` to the external Kienlab endpoint
- api (Node.js backend)
  - Express REST API under `/api`, Socket.IO for realtime
  - Optional TimescaleDB mirror (writes) and reads
  - Optional Redis cache for API responses and HMAC nonce store
  - AuthZ via Keycloak (OIDC + RBAC)
- keycloak – Identity Provider used by the frontend and backend
- db – TimescaleDB (PostgreSQL) for optional persistence/analytics
- redis – cache and nonce store (optional)
- prometheus – scrapes API metrics
- grafana – dashboards for metrics

Key flows:

- Frontend → nginx → api: REST, Socket.IO
- Frontend → nginx → Kienlab: `/kienlab/*` proxy for master data
- api → db/redis: mirror writes, read queries, caching
- api → keycloak: OIDC JWKS fetch and token verification
- prometheus → api: `/metrics` scrape
