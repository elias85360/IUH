# Documentation

This folder centralizes developer and operator documentation for the IoT Dashboard stack (frontend, backend, and infrastructure).

Contents:

- ARCHITECTURE.md – high‑level system diagram and service roles
- ENVIRONMENTS.md – dev vs prod profiles, ports, parity checklist
- SETUP_DEV.md – local development (Vite + backend + Keycloak)
- SETUP_COMPOSE.md – run the full stack with docker‑compose
- BACKEND.md – API service, env vars, persistence, caching
- FRONTEND.md – Vite app, env vars, auth, proxies
- API.md – HTTP endpoints and Socket.IO events
- SECURITY.md – RBAC/OIDC, API keys, HMAC, rate limit, hardening
- OBSERVABILITY.md – Prometheus, Grafana, logs, tracing
- DATA_GOVERNANCE.md – metrics, quality, retention, access
- KEYCLOAK.md – realm import, redirect URIs, roles
- TIMESCALE_REDIS.md – DB and cache wiring, options
- NGINX.md – static hosting, API and Kienlab reverse proxies
- TROUBLESHOOTING.md – common issues and fixes
- RUNBOOK.md – day‑2 operations (alerts, rotation, backups)
- ROADMAP.md – near‑term improvements
- ADRS/ – architectural decision records (key choices)
 - GLOSSARY.md – definitions of all technical terms used
 - UI_GUIDE.md – user guide for navigation and interactions
 - FILTERS_OPTIONS.md – every filter and analysis option explained
 - ROLES_PERMISSIONS.md – viewer/analyst/admin capabilities
