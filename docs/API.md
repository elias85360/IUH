# API HTTP/WS

## Auth et headers
- Routes /api : apiKeyMiddleware + hmacMiddleware + requireAuth si RBAC_ENFORCE=1. Roles attendus par route : viewer, analyst, admin.
- Modes : Bearer API key (Authorization), Bearer JWT OIDC (Keycloak), HMAC (x-api-key-id, x-api-date, x-api-signature, x-api-nonce si enforce).
- API_HMAC_ENFORCE force la signature; ALLOW_API_KEY_WITH_RBAC autorise cle + role quand RBAC actif.
- Rate limit via RATE_LIMIT (def 1000/15m) avec skip sur GET timeseries/kpis/devices/metrics.
- /metrics (hors /api) peut exiger METRICS_API_KEY (Bearer).

## Endpoints
- GET /api/health | /healthz : { ok, diagnostics }.
- GET /api/ready : { ok, components{api,datastore,tsdb,redis} } (503 si degrade).
- Assets : GET /api/assets/meta (viewer). PUT /api/assets/meta (analyst) body { updates, replace? } -> meta fusionnee.
- Thresholds : GET /api/settings/thresholds (viewer). PUT /api/settings/thresholds (admin) merge ou replace. GET /api/thresholds/effective?deviceId=... (viewer) renvoie seuils cumules.
- Reference : GET /api/devices (viewer). GET /api/metrics (viewer).
- Telemetrie :
  - GET /api/kpis?deviceId=&from=&to= (viewer). Cache 5s + ETag. Peut lire Timescale si TSDB_READ=1.
  - GET /api/timeseries?deviceId=&metricKey=&from=&to=&limit=&bucketMs= (viewer). Cache 5s + ETag; stride si > MAX_API_POINTS; Timescale si TSDB_READ=1; downsampling pre-agg 1h/1j si bucketMs large.
  - GET /api/diagnostics (viewer) stats internes.
  - GET /api/quality?from=&to=&bucketMs=&detail=0|1 (viewer) fraicheur/completeness/gaps par couple device/metric.
  - GET /api/forecast?deviceId=&metricKey=&from=&to=&horizon=&step= (viewer). Appel FORECAST_URL sinon forecast lineaire sur 2 derniers points.
- Alerting :
  - GET /api/alerts/routing (admin) et PUT /api/alerts/routing (admin) pour routeSlack/routeWebhook/slackWebhookUrl/slackChannel/webhookUrl.
  - POST /api/alerts/test (admin) envoie un alert fictif via routeurs.
- Notifications/exports :
  - POST /api/notify (analyst) -> email via mailer.
  - POST /api/test/smtp (admin) -> email test vers ALERTS_TO.
  - GET /api/export.csv?deviceId=&metricKey=&from=&to= (analyst) CSV timestamp,value.
  - GET /api/export.pdf?deviceId=&from=&to=&title= (analyst) PDF KPIs (501 si pdfkit absent).
- Admin :
  - GET /api/admin/status (admin) expose flags (RBAC, HMAC, TSDB, routes alertes, mask des secrets).
  - GET /api/admin/ping (apiKey uniquement) pour valider API_KEY.
  - POST /api/admin/hmac-test (admin + HMAC si actif) -> { ok:true }.

## Reponses et cache
- Erreurs : JSON { error, code?, details? } avec status approprie (400/401/403/404/500/503).
- /api/kpis et /api/timeseries : ETag faible + Cache-Control (public ou private, max-age=5). If-None-Match supporte 304.
- export.* definissent Content-Disposition pour telechargement.
- /metrics : exposition Prometheus; proteger via Authorization Bearer <METRICS_API_KEY> si defini.
