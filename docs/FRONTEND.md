# Frontend

Tech stack: React + Vite, React Router, React Query, Socket.IO client, Recharts.

Dev server:

- `vite.config.js` proxies:
  - `/api`, `/metrics` → `VITE_API_PROXY_TARGET` (recommended `http://localhost`)
  - `/kienlab` → `VITE_MASTER_PROXY_TARGET` (recommended `http://localhost` for parity)

Environment variables (`frontend/.env`):

- API/backend: `VITE_API_PROXY_TARGET`, `VITE_API_BASE` (optional explicit base)
- Mode: `VITE_DATA_SOURCE` (empty → backend mode; `master` → direct Kienlab)
- OIDC: `VITE_OIDC_ISSUER_URL`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`, `VITE_REQUIRE_AUTH`
- Kienlab (master): `VITE_MASTER_BASE`, `VITE_KIENLAB_DEVICES`, `VITE_MASTER_PROXY_TARGET`, `VITE_LOG_MASTER`

Auth flow:

- PKCE Authorization Code via Keycloak
- Redirect handled at `/auth/callback`

