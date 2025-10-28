# Prometheus in This Project

Access: http://localhost:9090

Configuration: `infra/prometheus.yml` (mounted into the container)

- Scrape job `prometheus` default
- Scrape job `api` (example) should target the API container at `api:4000/metrics`

Metrics exposed by backend (examples):

- `http_requests_total{route=...,method=...,status=...}` – request counts per route
- `http_request_duration_seconds_bucket` – request latency histogram
- `http_errors_total` – error counter
- `api_cache_hits_total`, `api_cache_misses_total` – cache KPIs
- `api_points_returned_total{route=...}` – datapoints served to UI

Alerting:

- Example alerting groups are provided for Grafana (see `infra/grafana/provisioning/alerting`)
- Typical SLOs: p95 latency thresholds, error rate percentages, scrape failures

Compose wiring:

- The compose file mounts `prometheus.yml` and links Prometheus to the default network; the API is reachable as `api:4000`.

