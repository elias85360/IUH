# Security & Hardening

AuthN/Z:

- OIDC (Keycloak): set `RBAC_ENFORCE=1`, configure `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`
- Audience/issuer checks: enable `OIDC_REQUIRE_AUD=1`, set `OIDC_IGNORE_ISSUER=0` on stable FQDN
- API key (fallback): disable in prod (`ALLOW_API_KEY_WITH_RBAC=0`, remove `API_KEY`)

Transport/proxy:

- Set `TRUST_PROXY=true` behind nginx; terminate TLS at nginx
- CSP/headers: nginx and Vite dev inject strict headers (CSP, X-Frame-Options, COOP/CORP)

Rate limiting:

- `RATE_LIMIT`, exemption for hot GETs (timeseries, kpis, devices, metrics)

HMAC anti‑replay (optional):

- `API_HMAC_ENFORCE=1`, set `API_HMAC_KEY_ID`/`API_HMAC_SECRET` or `API_HMAC_KEYS`
- Nonce store: enable `API_HMAC_NONCE_ENFORCE=1` with Redis (`REDIS_URL`)

Data protection:

- Audit log append file (`AUDIT_LOG_FILE`) for sensitive changes (assets/settings)
- PII‑free metrics payloads; scrub logs

Checklist before prod:

- Remove default credentials; rotate secrets in CI/CD
- Lock down CORS to your hostname
- Harden Keycloak (admin password, realms, clients) and adjust `redirectUris`

