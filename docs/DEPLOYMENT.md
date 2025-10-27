# Deployment Guide (Windows & Linux)

## 1) Files to deploy
- Modified: `frontend/vite.config.js`, `frontend/src/services/api.js`, `frontend/.env.example`, `README.md`
- Created: docs (`SECURITY.md`, `DATA_GOVERNANCE.md`, `OBSERVABILITY.md`, `UPGRADE_PLAN.md`, `DEPLOYMENT.md`), `infra/docker-compose.yml`, tests, seed scripts

## 2) Verification
- Frontend: `cd frontend && npm install && npm run dev`
- Backend: `cd backend && npm install && npm start`
- Dev HTTPS: `DEV_HTTPS=1 npm run dev` (frontend)
- CSP: check console; add origins in `CSP_ORIGINS` if needed

## 3) Docker (Linux/macOS/WSL/Windows)
- `cd infra`
- `docker compose up -d` (db, redis, keycloak, api, prometheus, grafana, nginx)
- Keycloak: `http://localhost:8080` (admin/admin), realm `iot`, client `iot-dashboard`
- Nginx: reverse proxy on `http://localhost` with security headers and CSP. Edit `infra/nginx.conf` to customize CSP and TLS.

TLS (optional):
- Generate certs and mount them as a bind volume in the nginx container (e.g., `/etc/nginx/certs`).
- Uncomment the HTTPS server block in `infra/nginx.conf` and set `ssl_certificate`/`ssl_certificate_key` paths.
- When HTTPS is enabled, consider enabling HSTS (`Strict-Transport-Security`) in `infra/nginx.conf`.

## 4) Tests
- E2E: `cd frontend && npm i -D @playwright/test && npx playwright test`
- Unit: `cd frontend && npm i -D vitest && npx vitest run`

## 5) Rollback (minimal)
- Restore modified files from previous branch/zip
- Remove `infra/`, `frontend/tests/`, `backend/scripts/`, `backend/data/mocks/` if undesired

## 6) Security hardening checklist (prod)
- Set `RBAC_ENFORCE=1` on backend; avoid using `API_KEY` for user traffic in prod.
- Restrict `CORS_ORIGIN` to your frontend origin(s), remove wildcards.
- Keep CSP restrictive in `infra/nginx.conf` (`connect-src` only to known backends, `ws(s)` if needed).
- Rotate API HMAC secrets regularly if enabled; prefer OIDC JWT for user sessions.
- Frontend in dev: set `DEV_HTTPS=1` to avoid mixed-content; in prod, terminate TLS at Nginx.
