# Frontend (React + Vite)

Features:
- Manual data loading (no auto fetch)
- Global loading bar (NProgress)
- Filters: period, types, metrics, room, devices
- Device cards: KPIs + charts (Line/Area/Bar/Scatter) with Brush and threshold lines
- KPI bar, Daily Consumption (7d), Compare Panel, Diagnostics
- Socket.IO connection for real-time points and alerts

Run locally:  
```
cd frontend
npm install
npm run dev
```

Env vars:
  - `VITE_API_PROXY_TARGET` – dev proxy target for `/api` requests (defaults to `http://localhost:4000`).
  - `VITE_REQUIRE_AUTH` – set to `1` to require authentication via OIDC. When set to `0`, the frontend will not attempt to configure OIDC and all users are considered anonymous.
  - `VITE_DATA_SOURCE` – select the data source: `mock` runs the in‑memory generator, while `master` fetches real data from Kienlab via the `/kienlab` proxy. Use `master` for production or when Kienlab is reachable.
  - `VITE_API_KEY` – optional bearer token if the backend enforces API keys or RBAC with API keys enabled.
  - OIDC (Keycloak):
    - `VITE_OIDC_ISSUER_URL` – e.g., `http://localhost:8080/realms/iot`. Must match your Keycloak realm’s issuer URL.
    - `VITE_OIDC_CLIENT_ID` – e.g., `iot-dashboard`.
    - `VITE_OIDC_REDIRECT_URI` – e.g., `http://localhost:5174`. Must correspond to one of the redirect URIs configured for the Keycloak client.

