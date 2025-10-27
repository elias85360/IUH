# IoT Dashboard Upgrade Plan & Progress

Status: Phase 1 completed
Last updated: <!-- updated-by-codex: Phase 1 complete — nginx config added, docs updated -->

## Scope & Goals
- Security: HTTPS/WSS, OIDC + RBAC, API keys/HMAC, rate limiting, CSP, validation/sanitization, audit log.
- Analytics: multi‑échelles, stats descriptives, filtres avancés, cross‑highlight, comparatifs, anomalies, prévisions, exports CSV/JSON/PDF.
- Data Governance: metric registry, TZ normalization (UTC), gaps handling, data quality health page, ETL rules.
- Ops/Perf: TimescaleDB, Redis cache, pré‑agrégations, ETag, Prometheus/Grafana, OpenTelemetry.

## Phases & Checklist

### Phase 1 — Foundations Security (Dev/Prod)
- [x] Frontend CSP strict + HTTPS option (`frontend/vite.config.js`, env `DEV_HTTPS`, `CSP_ORIGINS`)
- [x] Backend Helmet + env-driven rate limit (IP/token), CORS via env
- [x] API keys + optional HMAC anti‑replay headers (frontend signer + backend verifier)
- [x] Input validation (Zod) on API params
- [x] Audit log for sensitive actions (export.csv, notify)
- [x] Nginx reverse proxy with strict headers/CSP (`infra/nginx.conf`) and TLS guidance in docs

### Phase 2 — AuthN/AuthZ (OIDC + RBAC)
- [x] Keycloak in compose, realm & client seeded (infra/keycloak/realm-iot.json)
- [x] Frontend OIDC login, route guards (viewer/analyst/admin)
- [x] Frontend OIDC env names fixed to `VITE_OIDC_*` (`frontend/.env.example`)
- [x] Backend RBAC middleware, route scopes (env `RBAC_ENFORCE`)

### Phase 3 — Storage, Cache, Pre‑Aggregations
- [x] TimescaleDB schema (hypertables, indexes) + mirror writes (optional)
- [x] Redis caching + ETag for `/api/timeseries` and KPIs
- [x] Continuous aggregates (hourly/daily) + optional refresh loop (`TSDB_REFRESH_SECONDS`)

### Phase 4 — Analytics UX (Analyst‑Ready)
- [x] Cross‑highlight entre graphiques (hover Ts partagé)
- [x] Stats descriptives visibles (StatsPanel)
- [x] Anomalies robustes (z‑score) + dérivées
- [x] Prévisions (overlay): client linéaire + endpoint `/api/forecast`; microservice `py-forecast` (compose)
- [x] Vues comparatives multi‑devices + top/bottom
- [x] Exports CSV/JSON (front), PDF (backend) — PDF optionnel si pdfkit installé
- [x] UX: y‑scale log/linear, SMA/EMA paramétrables, thème clair/sombre, i18n FR/EN (basique)
- [x] Scènes partageables (déjà présent)

### Phase 5 — Governance & Data Quality
- [x] Metric registry (unités, plages, conversions) – en place dans metricsRegistry et thresholds
- [x] Normalisation TZ (UTC) – timestamps en ms UTC from end-to-end; gaps gérés par buckets
- [x] Page “Santé des données” (fraîcheur, complétude) – route `/health`, endpoint `/api/quality`
- [x] Règles ETL documentées – DATA_GOVERNANCE.md complété; validations Zod côté API

### Phase 6 — Observability & Performance
- [x] Prometheus metrics (RPS, latences, erreurs, cache hit)
- [x] OpenTelemetry traces (helpers no-op si non installés), doc d’activation via env
- [x] Dashboards Grafana (datasource + dashboard Backend Overview)
- [x] Benchmarks: script smoke `scripts/smoke-perf.mjs` (autocannon)

### Phase 7 — Tests & CI
- [x] Unit tests backend (middleware HMAC/API key, DataStore agrégations) – script `npm run test:backend`
- [x] E2E Playwright – squelette `frontend/tests/smoke.spec.ts` (désactivé par défaut)
- [x] CI GitHub Actions – build + tests (`.github/workflows/ci.yml`)

## Env & Config (extraits)
- Frontend: `VITE_API_BASE`, `VITE_API_KEY`, `VITE_API_HMAC_*`, `DEV_HTTPS`, `CSP_ORIGINS`, OIDC vars
- Backend: `API_KEY`, `RATE_LIMIT`, DB/Redis URLs, OIDC, OTEL, etc.

## Acceptance Criteria
- RBAC opérationnel; CSP stricte; rate limit actif; audit log persistant
- Switch d’échelle <200 ms (cache/pré‑aggs), cross‑highlight <100 ms
- Exports CSV/JSON/PDF fidèles; page “Santé des données” fonctionnelle
- Observabilité: métriques, traces, dashboards

## Rollback Strategy
- Feature flags via env (OIDC, HMAC, TSDB/Redis). Restauration fichiers modifiés. Suppression composants infra optionnels.

## Change Log
- [x] Initialized plan file and baseline configs/docs (CSP dev, HMAC option, env examples, infra compose, tests scaffolding)
