# SECURITY.md

Hardening across frontend, API, and infrastructure.

- Transport security: HTTPS/WSS end-to-end. In dev, toggle `DEV_HTTPS=1` for Vite; in prod use Nginx with TLS.
- Identity: OIDC/OAuth2 via Keycloak. Roles: `viewer`, `analyst`, `admin`. Enforce RBAC in API routes and UI gates.
- API keys: Support Bearer tokens for service integrations; rotate keys (`API_KEY_ROTATION_DAYS`) and store hashes.
- Anti-replay: Optional HMAC headers (`x-api-key-id`, `x-api-date`, `x-api-signature`) with 5 min clock skew.
- Rate limiting: IP and token-based limits (e.g., `RATE_LIMIT=1000/15m`) per route group.
- Content Security Policy: strict CSP in dev via Vite headers; mirror in Nginx with `connect-src` restricted to known origins. 
- Input validation: Zod/AJV schema validation at API boundaries; sanitize inputs/outputs; encode HTML.
- Audit logging: Persist auth events, role changes, API key issuance, export actions; immutable storage preferred.
- Secrets: `.env` not committed; use `.env.example`. Load via vault in prod; never log secrets.
- CORS: Allow only trusted origins; block credentials unless necessary.
- Dependency hygiene: Pin versions; SCA scans; minimal capabilities in containers (no root).

Threat model highlights:
- Unauthorized access → OIDC + RBAC + short-lived tokens
- Data exfiltration via exports → audit logs + signed URLs + expirations
- DoS → rate limit + caching + pre-aggregations + circuit breakers
- XSS/CSRF → strict CSP, same-site cookies, anti-CSRF tokens for stateful flows

Email alerts (Gmail):
- Configure SMTP for Gmail using an App Password (2FA required):
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=465`
  - `SMTP_SECURE=true`
  - `SMTP_USER=<your@gmail.com>`
  - `SMTP_PASS=<app password>`
  - `ALERTS_FROM=<sender>` and `ALERTS_TO=<recipient1,recipient2>`
  - `ALERTS_MIN_LEVEL=crit` to only notify on critical thresholds (or `warn` to include warnings)
 - Emails are triggered server‑side when a point crosses thresholds; RBAC is not required client‑side for automatic alerts.
