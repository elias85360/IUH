# Backend

Tech stack: Node.js 20, Express, Socket.IO, Prometheus client, Nodemailer.

Entrypoints:

- `backend/src/index.js` – app wiring, metrics, sockets, ingestion, graceful shutdown
- `backend/src/api.js` – REST under `/api`
- `backend/src/security.js` – Helmet, rate limit, API key, HMAC, RBAC/OIDC

Key env vars (`backend/.env.example`):

- Core: `PORT`, `CORS_ORIGIN`
- Auth: `RBAC_ENFORCE`, `ALLOW_API_KEY_WITH_RBAC`, `API_KEY`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_REQUIRE_AUD`, `OIDC_IGNORE_ISSUER`, `TRUST_PROXY`, `RATE_LIMIT`
- Kienlab: `DATA_SOURCE=kienlab`, `KIENLAB_BASE`, `KIENLAB_DEVICES`, `KIENLAB_*`
- Persistence: `DATABASE_URL`, `TSDB_MIRROR`, `TSDB_READ`, `TSDB_REFRESH_SECONDS`, `PREAGG_RETENTION_DAYS`
- Cache/nonce: `REDIS_URL`
- HMAC: `API_HMAC_ENFORCE`, `API_HMAC_KEY_ID`, `API_HMAC_SECRET`, `API_HMAC_NONCE_ENFORCE`, `API_HMAC_NONCE_TTL_MS`
- Alerts: SMTP settings, Slack/webhook routing

Docker image: `backend/Dockerfile` (`NODE_ENV=production`, `npm install --omit=dev`).

