# Keycloak

Realm import:

- `infra/keycloak/realm-iot.json` is mounted into the container and imported on start
- Roles: `viewer`, `analyst`, `admin`
- Client: `iot-dashboard` (public)

Redirect URIs and Origins (dev + prod):

- `http://localhost/*`, `http://localhost/auth/callback`
- `http://localhost:5174/*`, `http://localhost:5174/auth/callback`

Backend validation options:

- `OIDC_IGNORE_ISSUER=1` (tolerate different hostnames in compose); disable in real prod
- `OIDC_REQUIRE_AUD=1` to enforce `aud` matches `OIDC_CLIENT_ID`

