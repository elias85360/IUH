# IoT Dashboard (Frontend + Backend)

This project contains a Vite React frontend and a Node.js backend (Express + Socket.IO). It includes security hardening options, data governance and observability guidance to make the dashboard production-ready.

## Run (dev)

1) Install dependencies (network required):

``` 
cd backend
npm install
```

2) Start server:

```
npm run start
```

Server listens on `http://localhost:4000` by default (configurable via `PORT`).

## Structure

- `backend/src/index.js` – Express app + HTTP server + Socket.IO + generator startup
- `backend/src/api.js` – REST endpoints under `/api`
- `backend/src/socket.js` – Socket.IO setup and event relays
- `backend/src/datastore.js` – In-memory timeseries store with KPIs and aggregation
- `backend/src/generator.js` – Mock data generator (drifts, noise, occasional spikes)
- `backend/src/config.js` – Devices, metrics, thresholds, baselines, server config

## REST API

- `GET /api/health` → `{ ok, diagnostics }`
- `GET /api/devices` → `{ devices: [{ id, name, type, room, tags }] }`
- `GET /api/metrics` → `{ metrics: [{ key, unit, displayName, thresholds }] }`
- `GET /api/kpis?deviceId=...&from=ms?&to=ms?` → `{ deviceId, kpis: { [metricKey]: { last, min, max, avg, unit } } }`
- `GET /api/timeseries?deviceId=...&metricKey=...&from=ms?&to=ms?&limit=n?&bucketMs=ms?` → `{ deviceId, metricKey, points: [{ ts, value, min?, max?, count? }] }`
- `GET /api/diagnostics` → summary counts
- `GET /api/export.csv?deviceId=...&metricKey=...&from=ms?&to=ms?` → CSV download

Notes:
- `from/to` are epoch milliseconds. If omitted in KPIs, last 1h is used.
- `bucketMs` performs average aggregation per bucket, returning `{ ts, value, min, max, count }`.

## Socket.IO Events

Namespace: root (default). Connect to `ws://localhost:4000` via Socket.IO client.

- Server → client
  - `hello`: `{ ok: true, ts }` (on connect)
  - `point`: `{ deviceId, metricKey, ts, value, level }` (every datapoint)
  - `alert`: `{ deviceId, metricKey, ts, value, level }` (only when `level` is `warn` or `crit`)

- Client → server
  - `subscribe`: `{ room: "<deviceId>::<metricKey>" }` to receive filtered events for a series

## Example Client (Socket.IO)

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:4000");
socket.on("hello", (p) => console.log("hello", p));
socket.on("point", (p) => console.log("point", p));
socket.on("alert", (a) => console.warn("alert", a));
// Optional specific subscription
socket.emit("subscribe", { room: "dev-1::temperature" });
```

## Frontend Integration Notes

- Do not auto-load on mount: present a "Charger les données" button.
- After user loads, fetch `GET /api/devices` and render filter UI.
- For selected device/metric and period, call `/api/timeseries` with `bucketMs` matching zoom scale.
- Connect to Socket.IO and stream `point`/`alert` for live updates; cache locally.
- Use `/api/kpis` for instant KPIs per device, and `/api/export.csv` for CSV.

## Security

- Dev CSP and security headers are set via `frontend/vite.config.js`. Toggle HTTPS in dev with `DEV_HTTPS=1`.
- Optional HMAC anti-replay for API calls: frontend signs requests using `VITE_API_HMAC_KEY_ID` and `VITE_API_HMAC_SECRET`.
- API rate limiting and Helmet enabled in backend (see `backend/src/security.js`).

### Auth (OIDC/RBAC)
- Backend (prod): set `RBAC_ENFORCE=1`, `ALLOW_API_KEY_WITH_RBAC=0`, `TRUST_PROXY=true`, and provide `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID` (and optionally `OIDC_JWKS_URL`).
- Frontend (prod): set `VITE_REQUIRE_AUTH=1`, `VITE_OIDC_ISSUER_URL`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI=https://<FQDN>/auth/callback` in `frontend/.env.production`.
- Keycloak realm: `infra/keycloak/realm-iot.json` (add production `<FQDN>` to `redirectUris` and `webOrigins`).

## Data Governance

See `DATA_GOVERNANCE.md`:
- Metric registry (units, thresholds, conversions)
- UTC normalization and gap handling
- Data quality (freshness, completeness, consistency)

### Data Health (Phase 5)
- Page: `/health` (menu → Data Health) – affiche par device/metric:
  - Dernier point et fraîcheur (âge du dernier point)
  - Complétude (buckets présents vs attendus sur la période)
  - Gaps (nombre de buckets manquants)
- API: `GET /api/quality?from=&to=&bucketMs=`

## Observability

See `OBSERVABILITY.md` and `infra/docker-compose.yml` for Prometheus and Grafana wiring.

## Configuration

Edit `backend/src/config.js` to tweak devices, thresholds, baselines, and generator interval.

### Storage & Cache (Phase 3)
- Redis caching: set `REDIS_URL` to enable response caching and ETag for `/api/timeseries` and `/api/kpis`. Backend includes `ioredis` to connect when configured.
- TimescaleDB mirror writes: set `DATABASE_URL` and `TSDB_MIRROR=1` to mirror incoming points to TimescaleDB (hypertable `metrics`). Set `TSDB_READ=1` to serve queries from Timescale (raw or aggregated). Hourly/Daily continuous aggregates are created; enable periodic refresh via `TSDB_REFRESH_SECONDS`.

### Analytics (Phase 4)
- Cross‑highlight: le survol d’un graphe ajoute une règle verticale synchronisée sur les autres.
- “Prévu vs réel” (P): overlay de prévision linéaire; microservice de forecast optionnel.
- Top/Bottom: composant listant top/bottom devices par moyenne d’un metric.
- Export PDF: `GET /api/export.pdf?deviceId=...&from=...&to=...` (nécessite pdfkit installé côté backend), protégé par RBAC (analyst).

### Email Alerts (Gmail)
- Automatic emails are sent when thresholds are crossed (default: only critical).
- Configure SMTP (Gmail example) in `backend/.env`:
  - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`
  - `SMTP_USER=<your@gmail.com>`, `SMTP_PASS=<app password>` (2FA required)
  - `ALERTS_FROM=<sender>`, `ALERTS_TO=<admin1@example.com,admin2@example.com>`
  - `ALERTS_MIN_LEVEL=crit` (or `warn`), `ALERTS_COOLDOWN_SECONDS=300`

## Profils d'exécution (dev/prod)

### Profil développement (local)
* Backend API sur http://localhost:4000
* Frontend Vite sur http://localhost:5174
* Proxy Vite vers http://localhost:4000 (`VITE_API_PROXY_TARGET`)
* RBAC désactivé (`RBAC_ENFORCE=0` dans `backend/.env.dev`)
* **DATA_SOURCE=master** – le frontend charge les données depuis Kienlab via `/kienlab`. Mettez `mock` si vous souhaitez utiliser le générateur sans connexion réseau.
* Auth requise (`VITE_REQUIRE_AUTH=1`) – la configuration OIDC est lue à partir des variables `VITE_OIDC_*` pour tester le flux Keycloak en dev.
* Fichier env : `frontend/.env.development`


### Profil production (compose)
- Backend API exposé sur http://localhost:4001 (via docker-compose)
- Frontend Vite sur http://localhost:5174
- Proxy Vite vers http://localhost:4001 (VITE_API_PROXY_TARGET)
- RBAC activé (RBAC_ENFORCE=1)
- DATA_SOURCE=kienlab
- Auth requise (VITE_REQUIRE_AUTH=1)
 - Fichier env: `frontend/.env.production`

### Harmonisation des variables d'environnement
- Toutes les variables frontend préfixées par VITE_
- Variables centralisées dans .env.example (frontend et backend)
- Devices et mappings identiques backend/frontend (KIENLAB_DEVICES)
- Pas d'usage direct de process.env dans le frontend (utiliser import.meta.env)

### Exemple de switch de profil
- Pour le dev, copier .env.example en .env et adapter :
  - VITE_API_PROXY_TARGET=http://localhost:4000
  - VITE_REQUIRE_AUTH=0
  - DATA_SOURCE=mock
- Pour la prod, copier .env.example en .env et adapter :
  - VITE_API_PROXY_TARGET=http://localhost:4001
  - VITE_REQUIRE_AUTH=1
  - DATA_SOURCE=kienlab

---

## Next Steps

- Enable OIDC/OAuth2 (Keycloak provided in `infra/docker-compose.yml`) and gate UI features by role (viewer/analyst/admin).
- Wire TimescaleDB and Redis for persistence and caching.
- Add PDF report generation service (behind signed URLs).
