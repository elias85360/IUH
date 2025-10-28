# Roles & Permissions (RBAC)

Roles (realm and/or client roles):

- viewer: read-only access to dashboards and API data
- analyst: can modify assets metadata and perform analysis exports
- admin: can change thresholds/settings, advanced admin endpoints

Backend enforcement examples:

- Assets Meta: GET requires `viewer`, PUT requires `analyst`
- Thresholds: GET requires `viewer`, PUT requires `admin`
- Data API (devices/metrics/kpis/timeseries/diagnostics): `viewer`

Auth paths:

- OIDC (recommended): JWT validation against Keycloak issuer; roles extracted from realm and client (`OIDC_CLIENT_ID`)
- API key (fallback/dev): treated as `admin` unless overridden; disable in prod
- HMAC (optional): request signing for anti-replay

Frontend gating:

- Routes wrapped by `RequireRole` to restrict views (alerts, assets, settings)
