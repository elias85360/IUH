# API Reference

Base URL: `http://localhost:4000`

Auth: If `API_KEY` is set on the backend, send header `Authorization: Bearer <token>`.

## GET /api/health
Response: 
```
{ "ok": true, "diagnostics": { ... } }
```

## GET /api/devices
```
{ "devices": [ { "id": "dev-1", "name": "Chaudière A", "type": "boiler", "room": "Salle A", "tags": ["prod"] } ] }
```

## GET /api/metrics
```
{ "metrics": [ { "key": "temperature", "unit": "°C", "displayName": "Température", "thresholds": {"warn": 28, "crit": 32} } ] }
```

## GET /api/kpis?deviceId=...&from=ms?&to=ms?
```
{ "deviceId": "dev-1", "kpis": { "temperature": {"last": 25.4, "min": 22.1, "max": 29.8, "avg": 25.2, "unit": "°C"} } }
```

## GET /api/timeseries?deviceId=...&metricKey=...&from=ms?&to=ms?&limit=n?&bucketMs=ms?
```
{ "deviceId": "dev-1", "metricKey": "temperature", "points": [ {"ts": 1710000000000, "value": 25.2, "min": 24.8, "max": 25.7, "count": 12, "sum": 302.5} ] }
```

## GET /api/diagnostics
```
{ "devices": 5, "metrics": 4, "seriesKeys": 20, "totalPoints": 12345, "uptimeMs": 120000, "now": 1710000000123 }
```

## GET /api/export.csv?deviceId=...&metricKey=...&from=ms?&to=ms?
Returns a CSV with columns: `timestamp,value`.

## Socket.IO Events
- Server→Client
  - `hello` → `{ ok, ts }`
  - `point` → `{ deviceId, metricKey, ts, value, level }`
  - `alert` → same as point when level is `warn` or `crit`
- Client→Server
  - `subscribe` → `{ room: "<deviceId>::<metricKey>" }`

