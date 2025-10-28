# Setup – Docker Compose (Prod‑like)

Build and run:

```
cd infra
docker compose up -d --build
```

Services brought up:

- nginx:80/443, api:4001 (published), keycloak:8080, db:5432, redis:6379, prometheus:9090, grafana:3000, mqtt-broker:1883/9001, py-forecast:8000

Frontend build args (injected at image build):

- `VITE_OIDC_ISSUER_URL`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`, `VITE_REQUIRE_AUTH`

Backend env (compose snippet):

- RBAC: `RBAC_ENFORCE=1`, `ALLOW_API_KEY_WITH_RBAC=1` (disable in real prod), `TRUST_PROXY=true`
- OIDC: `OIDC_ISSUER_URL=http://keycloak:8080/realms/iot`, `OIDC_IGNORE_ISSUER=1`
- DB/Cache: `DATABASE_URL=postgres://postgres:postgres@db:5432/iot`, `REDIS_URL=redis://redis:6379`
- Timescale: `TSDB_MIRROR=1`, `TSDB_READ=0`
- Kienlab: `KIENLAB_BASE=http://nginx/kienlab`

Security hardening before going live:

- Remove `API_KEY` or set `ALLOW_API_KEY_WITH_RBAC=0`
- Set `OIDC_REQUIRE_AUD=1` and `OIDC_IGNORE_ISSUER=0` when FQDN is stable
- Restrict `CORS_ORIGIN` to your hostname

