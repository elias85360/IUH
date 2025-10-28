# Setup – Development

Prerequisites: Node 20+, Docker, Docker Compose.

1) Start infra (compose):

```
cd infra
docker compose up -d db redis keycloak api nginx prometheus grafana mqtt-broker py-forecast
```

2) Configure Keycloak:

- realm import is automatic via compose (`infra/keycloak/realm-iot.json`)
- Ensure client `iot-dashboard` has redirect URIs:
  - `http://localhost/*`, `http://localhost/auth/callback`
  - `http://localhost:5174/*`, `http://localhost:5174/auth/callback`

3) Frontend dev server:

```
cd frontend
npm install
npm run dev
```

Ensure `frontend/.env` contains:

```
VITE_API_PROXY_TARGET=http://localhost
VITE_DATA_SOURCE=
VITE_OIDC_ISSUER_URL=http://localhost:8080/realms/iot
VITE_OIDC_CLIENT_ID=iot-dashboard
VITE_OIDC_REDIRECT_URI=http://localhost:5174
```

Open http://localhost:5174.

Notes:

- In master mode (`VITE_DATA_SOURCE=master`), the app hits Kienlab `/kienlab/api/raw...`; most deployments require auth and will return 401 unless you add appropriate headers at the proxy.
- For parity with prod, keep `VITE_DATA_SOURCE` empty to use the backend API.

