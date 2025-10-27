Keycloak Setup (Realm: iot)

1) Start Keycloak (docker-compose)
- Run: `docker compose -f infra/docker-compose.yml up -d keycloak`
- Open: `http://localhost:8080` (admin/admin from compose env)

2) Import the provided realm
- In the admin console, go to Realm selector → Import
- File: `infra/keycloak/realm-iot.json`
- Ensure realm name is `iot`

3) Verify client and roles
- Client `iot-dashboard` exists (OpenID Connect, public)
- Realm roles: `viewer`, `analyst`, `admin`

4) Create a test user
- Users → Add user (e.g., `demo`)
- Set credentials (password, temporary = off)
- Assign realm roles (e.g., `viewer` for read-only; add `analyst`/`admin` as needed)

5) Configure redirect URIs (dev vs prod)
- Dev: add `http://localhost/*`, `http://localhost:5174/*` to `redirectUris`, and matching `webOrigins`
- Prod: add `https://<FQDN>/*` to `redirectUris` and `webOrigins`

6) Frontend environment
- Dev (`frontend/.env.development`):
  - `VITE_OIDC_ISSUER_URL=http://localhost:8080/realms/iot`
  - `VITE_OIDC_CLIENT_ID=iot-dashboard`
  - `VITE_OIDC_REDIRECT_URI=http://localhost:5174`
- Prod (`frontend/.env.production`):
  - `VITE_OIDC_ISSUER_URL=https://<FQDN>/realms/iot`
  - `VITE_OIDC_CLIENT_ID=iot-dashboard`
  - `VITE_OIDC_REDIRECT_URI=https://<FQDN>`

7) Backend environment (prod)
- `RBAC_ENFORCE=1`, `ALLOW_API_KEY_WITH_RBAC=0`, `TRUST_PROXY=true`
- `OIDC_ISSUER_URL=http://keycloak:8080/realms/iot` (inside compose)
- Optional: `OIDC_JWKS_URL` if discovery is restricted

8) Login flow
- The app redirects to Keycloak `/auth` → user authenticates → callback `/auth/callback`
- Tokens are stored in sessionStorage; access token auto-refresh is enabled

