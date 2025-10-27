# Dashboard — Known Issues, Pitfalls, and Handover Notes

This document captures current problems, their root causes, and how to diagnose/fix them. It is intended for the next maintainer to quickly understand why the Home page may show empty charts, why auth errors happen, and how to run or deploy reliably.

## TL;DR
- Dev works best with: backend (Node) + frontend (Vite) + optional Nginx for reverse proxy; Kienlab ingestion enabled; no RBAC.
- Many 401/429/Failed‑to‑fetch issues came from mixing prod/dev configs (RBAC on vs off, wrong API base), request storms, and rate limiting.
- Home widgets require either `E` (energy, Wh) or fallback via integrating `P`; ensure the period and ingestion provide enough points.

## Current Startup Workflow (as observed)
- Backend: `cd backend && npm start` (Express at http://localhost:4000)
- Frontend: `cd frontend && npm run dev` (Vite at http://localhost:5174)
- Nginx (optional): `cd infra && docker compose up -d nginx` (serves SPA on http://localhost)

When running this way, the frontend dev server proxies `/api` to `API_PROXY_TARGET` (must be set to backend URL, e.g., http://localhost:4000).

## Major Issues (with causes and fixes)

### 1) Home page charts empty
- Symptoms: skeletons visible, tiles show 0; console shows `Failed to fetch` and sometimes `HTTP 401` or `429`.
- Causes:
  - Frontend hitting wrong API (compose API with RBAC) instead of local backend.
  - Token expiration (401) with no refresh or retry.
  - Request storm from Home prefetch and multiple widgets → browser resource exhaustion (ERR_INSUFFICIENT_RESOURCES) and backend 429.
  - Insufficient points for period/metric (E missing or too sparse).
- Fixes done:
  - Frontend production base uses same‑origin; dev uses Vite proxy; retries/backoff added; concurrency limited (global MAX_CONCURRENCY=8).
  - Backend rate limiter now skips read endpoints: `/api/timeseries`, `/api/kpis`, `/api/devices`, `/api/metrics`.
  - Token auto‑refresh implemented; on 401 the frontend refreshes once and retries.
  - Energy widgets fall back to integrating `P` if `E` provides zeros.
- Notes for dev: set `API_PROXY_TARGET=http://localhost:4000`; ensure backend .env has `RBAC_ENFORCE=0`.

### 2) 401 Unauthorized bursts (dev)
- Symptoms: `/api/*` return 401 after some time or immediately on Home.
- Causes:
  - RBAC enabled on API while frontend dev expects no login.
  - Token expires; frontend was not refreshing; calls continue with stale tokens.
- Fixes done:
  - Frontend: token auto‑refresh (refresh_token) and 401‑retry.
  - Dev mode guidance: set `RBAC_ENFORCE=0` in `backend/.env` when developing.

### 3) 429 Too Many Requests and `ERR_INSUFFICIENT_RESOURCES`
- Symptoms: large bursts of `timeseries` calls from multiple Home widgets; browser/network errors.
- Causes: too many concurrent fetches; backend rate limiting on `/api/timeseries`.
- Fixes done:
  - Frontend: global concurrency limiter + retry/backoff.
  - Backend: rate‑limit `skip` for high‑volume GETs.

### 4) Kienlab ingestion oddities
- Symptoms: adapter logs show 404 on `/api/master/raw` or intermittent rows=0.
- Causes:
  - `/api/master/raw` not present on all deployments (404 expected); adapter falls back to `/api/raw`.
  - `KIENLAB_BASE` should be domain root (no trailing `/api`), e.g., `http://eprophet.kienlab.com`.
  - If API requires token, `KIENLAB_AUTH_SCHEME=Bearer` and `KIENLAB_API_KEY` must be set and provided at runtime (not committed).
- State:
  - Ingestion shows periodic `rows=...` in logs, so it is ingesting. Use `backend/.env` for dev and compose env for prod.

### 5) Energy `E` not visible
- Symptoms: Missing energy charts or zero values.
- Causes: `E` (Wh) sparse or not provided; Home uses energy; Devices page didn’t have an Energy panel initially.
- Fixes done:
  - Devices: added “Energy (kWh)” panel (E converted from Wh → kWh).
  - Home: energy helpers fallback to integrating `P` when `E` sums to zero.

### 6) Dev vs Prod environment confusion
- Symptoms: Frontend calls wrong host; nginx vs vite differences; `.env` vs compose mismatch.
- Guidance:
  - Dev local: use `backend/.env` with `RBAC_ENFORCE=0`, run backend and frontend directly; use Vite proxy (`API_PROXY_TARGET=http://localhost:4000`). Do not involve Nginx unless testing SPA hosting.
  - Prod: use `infra/docker-compose.yml` with Nginx serving SPA, API behind Nginx, RBAC enforced, OIDC configured.
- Key difference:
  - `.env` files in `backend/` and `frontend/` are used only by local processes.
  - `infra/docker-compose.yml` defines container env (prod). Do not rely on `.env` when running containers unless mounted.

### 7) OIDC/Keycloak in Docker topology
- Symptoms: 401 despite valid browser login.
- Causes: issuer host mismatch (browser sees `http://localhost:8080`, API uses `http://keycloak:8080`), JWKS URL resolution.
- Fixes done:
  - Backend: tolerates issuer mismatch when configured; uses explicit `OIDC_JWKS_URL`.
  - Frontend: auto‑refresh support to prevent silent expiry.

### 8) Nginx vs Vite (prod vs dev)
- Symptoms: `/api` pointing to wrong place, CORS issues.
- Guidance:
  - Dev: Vite proxy handles `/api` (no CORS); set `API_PROXY_TARGET` to backend host.
  - Prod: Nginx proxies `/api` to API; frontend uses same origin (no explicit base URL).

### 9) Persistence of thresholds and asset meta
- Problem: changes were lost across container restarts.
- Fix: compose mounts `api_data:/app/backend/data` so `thresholds.json` and `assets-meta.json` persist.

## How to Diagnose Quickly
- Backend logs: look for `[kienlab] dev=... rows=...` every poll cycle.
- Backend health: `curl http://localhost:4000/metrics` and `curl http://localhost:4000/api/diagnostics`.
- Frontend network (DevTools): ensure `/api/*` are proxied by Vite to the local backend (status 200), not hitting compose API with RBAC.
- Home widgets: check `/api/timeseries` calls for `P` and `E` and see if results are 200 with non‑empty `points`.

## Recommended Minimal Stack (to match supervisor’s goals)
- Required:
  - Frontend (React) + Backend (Express) + Kienlab ingestion (HTTP polling).
  - Optional RBAC via OIDC (Keycloak) if you need auth in prod.
- Optional/performance:
  - Redis cache, TimescaleDB persistence.
- Optional observability:
  - Prometheus + Grafana.

## Services in infra/docker-compose.yml — which are NOT necessary
- Not required for the supervisor’s functional demo (real‑time + historical charts):
  - `db` (TimescaleDB) — optional; only needed for persistence/queries at scale.
  - `redis` — optional; only needed for response caching.
  - `keycloak` — optional; only if you enforce RBAC/SSO in prod.
  - `prometheus`, `grafana` — optional; observability only.
  - `py-forecast` — optional; only for forecast overlay.
  - `mqtt-broker` — optional; only if ingestion via MQTT is required.
- Required (prod):
  - `api` — the backend.
  - `nginx` — serve SPA and proxy `/api` and Socket.IO.

## Next Steps to Make Dev Reliable Again
1) Backend (dev):
   - `cd backend && npm ci && npm start`
   - Ensure `backend/.env` has `RBAC_ENFORCE=0`, `DATA_SOURCE=kienlab`, `KIENLAB_BASE=http://eprophet.kienlab.com`.
2) Frontend (dev):
   - `cd frontend && npm ci && $env:API_PROXY_TARGET='http://localhost:4000' && npm run dev`
   - Confirm network calls go to `http://localhost:5174/api/...` and return 200.
3) If Home still empty for `E`, switch period to 24h/7d or rely on `P` integration (already implemented as fallback).

## Path to Production (once dev is green)
- Use `infra/docker-compose.yml` with:
  - `RBAC_ENFORCE=1` (if SSO desired) and OIDC vars.
  - `KIENLAB_BASE` and `KIENLAB_API_KEY` provided via environment; set `KIENLAB_AUTH_SCHEME=Bearer` when you have the token.
  - Mount `api_data` volume for persistent thresholds/meta.
  - Serve SPA via `nginx` and proxy `/api`.

---
If anything is still unclear, start by confirming `devices`/`timeseries` work directly against the backend (curl) before involving the SPA and Nginx. This isolates ingestion from UI issues.

