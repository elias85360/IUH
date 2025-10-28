# Runbook

Health checks:

- API: `/metrics` (nginx and Prometheus), `/api/health`
- Frontend: `GET /healthz` on nginx

Secrets rotation:

- API key: update compose env, redeploy; prefer disabling API keys in prod
- OIDC client secret (if used): update Keycloak client and frontend/backend vars

Backups:

- TimescaleDB: dump `iot` schema; rotate and test restore

Alerts routing:

- Configure SMTP or Slack/Webhook env; adjust `ALERTS_MIN_LEVEL` and cooldown

Logs and audits:

- Backend audit log for settings/assets changes; ship application logs centrally

