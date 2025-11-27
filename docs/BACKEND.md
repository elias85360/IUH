# Backend (Node.js / Express)

## Vue rapide
- Entrypoint : src/index.js. Charge .env, valide l'env (envValidation), init metrics/telemetry, CORS, securite, compression et JSON (200kb), construit l'API, attache Socket.IO, demarre l'ingestion, branche mailer/routers d'alertes, lance le refresh Timescale si configure, bind PORT avec retry et shutdown gracieux.
- Config statique : src/config.js (devices/metriques/baselines/generator). La liste peut etre remplacee par KIENLAB_DEVICES.

## Securite et auth (src/security.js)
- applySecurity : request-id systematique, helmet, rate limiting parseRateLimit (def 1000/15m) avec skip sur GET charts, disable x-powered-by.
- apiKeyMiddleware : Authorization Bearer <API_KEY> (ignore si JWT present ou si RBAC actif sans cle fournie).
- hmacMiddleware : headers x-api-key-id / x-api-date / x-api-signature (+ x-api-nonce si API_HMAC_NONCE_ENFORCE=1). Secret via API_HMAC_SECRET ou API_HMAC_KEYS. Nonce store Redis (REDIS_URL) sinon memoire.
- requireAuth/requireRole : RBAC_ENFORCE=1 active verif OIDC (OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REQUIRE_AUD, OIDC_IGNORE_ISSUER). ALLOW_API_KEY_WITH_RBAC permet un fallback cle+role. Roles utilises : viewer, analyst, admin.
- recordAudit : append JSON line dans AUDIT_LOG_FILE (def audit.log) avec body preview masque.

## DataStore et stockage (src/datastore.js)
- Buffer circulaire par device/metric (SERIES_CAP def 20000) avec stats points.
- Pre-aggregations 1h/1j (PREAGG_RETENTION_DAYS) et agregation bucketMs; stride / cap MAX_API_POINTS cote API.
- Seuils : thresholds par def config.metrics + overrides via settingsStore (global/group/room/device) + hysteresis deadbandPct.
- Events : addPoint emet "point" et "alert" selon warn/crit; _lastLevel gere l'hysteresis.
- Timescale : TSDB_MIRROR=1 ou DATABASE_URL active mirrorAddPoint; TSDB_READ=1 permet querySeries/queryKpis via db/timescale; refreshCaggs via TSDB_REFRESH_SECONDS dans index.js.
- Diagnostics : uptime, counts; querySeries gere limit/bucket; getKpis calcule last/min/max/avg.

## API HTTP (src/api.js)
- Router protege par apiKeyMiddleware + hmacMiddleware + requireAuth si RBAC_ENFORCE=1; requireRole par route (viewer/analyst/admin).
- Cache TTL 5s via cache.js + weak ETag sur /kpis et /timeseries (304 support); /timeseries stride si trop de points.
- Endpoints : /health, /healthz, /ready; /assets/meta GET/PUT; /settings/thresholds GET/PUT; /thresholds/effective; /devices; /metrics; /kpis; /timeseries; /diagnostics; /quality; /forecast; /export.csv; /export.pdf; /notify; /alerts/routing GET/PUT; /alerts/test; /test/smtp; /admin/status; /admin/ping; /admin/hmac-test.

## Ingestion (src/sources)
- startIngestion choisit via DATA_SOURCE=mock|http|http-poll|poll|ws|websocket|mqtt|kienlab|kienlab-http.
- mock : generator.js avec baselines/jitter + spikes.
- httpPoll : REMOTE_BASE_URL ou REMOTE_POINTS_URL, poll REMOTE_POLL_MS, headers REMOTE_AUTH_HEADER/REMOTE_AUTH_VALUE ou REMOTE_API_KEY (+ REMOTE_AUTH_SCHEME).
- ws : REMOTE_WS_URL, auth optionnelle via REMOTE_API_KEY.
- mqtt : REMOTE_MQTT_URL, REMOTE_MQTT_TOPIC (def points/#), REMOTE_MQTT_USER/PASS.
- kienlab-http : KIENLAB_BASE + KIENLAB_DEVICES, length/poll/timeout/retry, mapping via KIENLAB_MAP JSON ou KIENLAB_MAP_<metric>, updateIotMetrics pour Prom.

## Notifications et alerting
- notify.js : mailer nodemailer si SMTP_HOST/PORT et ALERTS_FROM/ALERTS_TO; createRoutersFromEnv pour Slack (ROUTE_SLACK + SLACK_WEBHOOK_URL/SLACK_CHANNEL) ou webhook (ROUTE_WEBHOOK + WEBHOOK_URL).
- index.js applique ALERTS_MIN_LEVEL et ALERTS_COOLDOWN_SECONDS (Map par device/metric/level) avant envoi mail/routers.
- /api/notify (analyst) permet d'envoyer un email cote front.

## Temps reel (src/socket.js)
- Socket.IO sur le meme serveur HTTP; emits hello, point, alert; rooms deviceId::metricKey.
- Options : SOCKET_VOLATILE_POINTS, SOCKET_POINT_MIN_INTERVAL_MS (def 100ms), SOCKET_MAX_BROADCASTS_PER_SEC.
- Compteurs Prom via incSocketConnections/decSocketConnections et recordAlert.

## Observabilite
- metrics.js : prom-client si dispo. Expose /metrics (METRICS_API_KEY optionnel). Compteurs http/cache/points/alerts, gauges dataFreshness/completeness/gaps et metrics IoT (temp/humid/U/I/P/E/F/pf). Middleware httpMetricsMiddleware et initMetrics.
- otel.js : wrappers withSpan/spanAddEvent si @opentelemetry/api installe.
- envValidation.js : detecte incoherences (Kienlab sans base/devices, TSDB sans DATABASE_URL, RBAC sans issuer/client, HMAC sans secret, SMTP incomplet) et peut throw en strict (NODE_ENV=production ou ENV_STRICT=1).

## Persistence et cache
- persist.js : backend/data (ensure dir). settingsStore (thresholds.json), assetsMeta (assets-meta.json).
- cache.js : mem TTL ou Redis (REDIS_URL), makeKey SHA-1; util/etag fournit weakEtag.

## Variables clefs (resume)
- Serveur : PORT, CORS_ORIGIN, TRUST_PROXY, LOG_LEVEL.
- Auth/RBAC : RBAC_ENFORCE, OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REQUIRE_AUD, OIDC_IGNORE_ISSUER, ALLOW_API_KEY_WITH_RBAC, API_KEY.
- HMAC : API_HMAC_ENFORCE, API_HMAC_KEY_ID/API_HMAC_SECRET ou API_HMAC_KEYS, API_HMAC_NONCE_ENFORCE, API_HMAC_NONCE_TTL_MS.
- Ratelimit : RATE_LIMIT.
- Ingestion : DATA_SOURCE, REMOTE_BASE_URL, REMOTE_POINTS_URL, REMOTE_POLL_MS, REMOTE_AUTH_HEADER/REMOTE_AUTH_VALUE, REMOTE_API_KEY, REMOTE_AUTH_SCHEME, REMOTE_WS_URL, REMOTE_MQTT_URL, REMOTE_MQTT_TOPIC, REMOTE_MQTT_USER, REMOTE_MQTT_PASS, KIENLAB_* (BASE, DEVICES, AUTH_SCHEME, API_KEY, LENGTH, POLL_MS, TIMEOUT_MS, RETRY, MAX_INIT_ROWS, MAP, MAP_<key>, DEBUG), FORECAST_URL.
- Stockage : SERIES_CAP, PREAGG_RETENTION_DAYS, DATABASE_URL, TSDB_MIRROR, TSDB_READ, TSDB_REFRESH_SECONDS, REDIS_URL, MAX_API_POINTS.
- Alerting/notify : SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_REQUIRE_TLS, SMTP_IGNORE_TLS, SMTP_TLS_REJECT_UNAUTHORIZED, ALERTS_FROM, ALERTS_TO, ALERTS_MIN_LEVEL, ALERTS_COOLDOWN_SECONDS, ROUTE_SLACK, SLACK_WEBHOOK_URL, SLACK_CHANNEL, ROUTE_WEBHOOK, WEBHOOK_URL.
- Metrics/autres : METRICS_API_KEY, SOCKET_VOLATILE_POINTS, SOCKET_POINT_MIN_INTERVAL_MS, SOCKET_MAX_BROADCASTS_PER_SEC, ENV_STRICT.
