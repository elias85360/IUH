# API Reference

Base path: `/api`

Endpoints:

- `GET /api/health` → `{ ok, diagnostics }`
- `GET /api/devices` → `{ devices: [{ id, name, type, room, tags }] }`
- `GET /api/metrics` → `{ metrics: [{ key, unit, displayName, thresholds? }] }`
- `GET /api/kpis?deviceId=&from=&to=` → `{ deviceId, kpis: { [metricKey]: { last, min, max, avg, unit } } }`
- `GET /api/timeseries?deviceId=&metricKey=&from=&to=&limit=&bucketMs=` → `{ deviceId, metricKey, points: [{ ts, value, min?, max?, count? }] }`
- `GET /api/diagnostics` → summary counts
- `GET /api/export.csv?...` → CSV
- Assets meta: `GET/PUT /api/assets/meta`
- Thresholds: `GET/PUT /api/settings/thresholds`, `GET /api/thresholds/effective?deviceId=`

Auth:

- OIDC Bearer (recommended in prod; `RBAC_ENFORCE=1`)
- API key Bearer (dev/ops; disable in prod): `authorization: Bearer <API_KEY>`
- Optional HMAC anti‑replay (`x-api-*` headers)

Socket.IO:

- Server → client: `hello`, `point`, `alert`
- Client → server: `subscribe { room: "<deviceId>::<metricKey>" }`

Caching & ETag:

- `/api/timeseries` and `/api/kpis` return weak ETag and short cache lifetimes; Redis augments caching when configured.

