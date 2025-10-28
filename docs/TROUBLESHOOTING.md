# Troubleshooting

401 Unauthorized on `/kienlab/api/raw` in dev:

- Cause: frontend in `master` mode calls Kienlab directly; endpoint requires auth
- Fix: use backend mode (`VITE_DATA_SOURCE=`) and `VITE_API_PROXY_TARGET=http://localhost`, or configure proxy with proper headers

CORS errors:

- Ensure `CORS_ORIGIN` includes your origin; in compose, restrict to `http://localhost`

OIDC login loops or token errors:

- Add `http://localhost/*` and `http://localhost:5174/*` to redirect URIs
- In compose, `OIDC_IGNORE_ISSUER=1` helps when issuer hostnames differ

Port already in use:

- Backend auto‑increments port up to 10 tries; stop conflicting processes or adjust `PORT`

No data / empty charts:

- Check that ingestion mode is correct: backend `DATA_SOURCE=kienlab` with a reachable `KIENLAB_BASE`, or mock generator

