# Infra / Compose

## Services (infra/docker-compose.yml)
- keycloak-db : Postgres pour Keycloak (volume keycloak_db_data).
- keycloak : OIDC realm (infra/keycloak/realm-iot.json), port 8080, variables KC_* / KEYCLOAK_*.
- db : TimescaleDB/Postgres, port 5432, volume db_data.
- redis : cache/rate limit, port 6379.
- api : build ../backend, port 4001->4000, RBAC/HMAC/Kienlab/SMTP/TSDB/Redis configurables, volumes api_data (backend/data) et api_logs.
- prometheus : scrape /metrics, port 9090, config infra/prometheus.yml.
- grafana : dashboards provisionnes (infra/grafana/provisioning), port 3000.
- nginx : build infra/nginx.Dockerfile (sert frontend et proxy /api, /socket.io, /kienlab->KIENLAB_PROXY_TARGET), port 8081.

## Flux
- Navigateur -> nginx : sert la SPA et proxy /api|/socket.io vers api:4000.
- Backend -> TimescaleDB/Redis pour stockage/cache; /metrics scrappes par Prometheus -> Grafana.
- Keycloak assure OIDC; nginx peut proxy /kienlab vers une cible externe pour l'ingestion DATA_SOURCE=kienlab.

## Environnement
- Fichiers : infra/.env, .env.dev, .env.prod.example.
- Variables clefs : DB_USER/DB_PASSWORD/DB_NAME, API_KEY, DATA_SOURCE, KIENLAB_BASE/DEVICES/API_KEY..., RBAC_ENFORCE, OIDC_ISSUER_URL(_INTERNAL), OIDC_CLIENT_ID, METRICS_API_KEY, SMTP_*, ALERTS_*.
- Volumes : api_data (thresholds.json, assets-meta.json), api_logs, keycloak_db_data, db_data.
- Ports : 8081 (nginx), 4001 (API directe), 8080 (Keycloak), 5432 (DB), 6379 (Redis), 9090 (Prometheus), 3000 (Grafana).

## Operations rapides
- Demarrer : `cd infra && docker compose up -d --build`.
- Logs : `docker compose logs -f api` (ou keycloak/prometheus/grafana/nginx).
- Arret : `docker compose down` (garde les volumes sauf option -v).
- Dev local hors compose : backend `cd backend && npm install && npm run start` ou `npm run dev`; frontend `cd frontend && npm install && npm run dev` (proxy nginx optionnel).
