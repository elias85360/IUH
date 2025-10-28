# Observability

Metrics:

- `prom-client` exposes `/metrics` on the API
- Counters: requests, errors, cache hits/misses, points returned
- Histograms: latency per route

Traces:

- OpenTelemetry hooks present; wire exporter if needed (`backend/src/otel.js`)

Logs:

- morgan combined logs; add JSON logger for prod if required

Dashboards:

- Grafana provisioning mounted from `infra/grafana/provisioning`

Alerts:

- Email/Slack/Webhook via backend `notify` wiring (thresholds emit events)

