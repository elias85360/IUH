# Architecture

- Frontend React/Vite (SPA) servi par Nginx; consomme l'API HTTP et le flux Socket.IO.
- Backend Express (src/index.js) : CORS configurables, securite (helmet, rate limit, API key, HMAC, OIDC RBAC), instrumentation, API REST et Socket.IO.
- Flux donnees : startIngestion (mock/http/ws/mqtt/kienlab) -> DataStore (buffer borne + pre-agg) -> alert routing -> API/cache -> frontend (HTTP/WS) -> exports PDF/CSV.
- Stockage : memoire process avec pre-aggregations 1h/1j, mirroring optionnel vers TimescaleDB (pg) et cache TTL via Redis; persistence locale des metadonnees (backend/data).
- Temps reel : Socket.IO broadcast des points et alertes avec protections de debit.
- Observabilite : /metrics Prometheus, OpenTelemetry optionnel, Prometheus+Grafana dans infra/.
- Securite : RBAC OIDC (Keycloak), API key/HMAC, rate limiting dedie, CORS flexible; Nginx fait le reverse proxy vers /api, /socket.io et /kienlab.
- Infra compose : nginx (reverse proxy + build frontend), api, db (Timescale/Postgres), redis, keycloak + base, prometheus, grafana; volumes pour data et logs.
