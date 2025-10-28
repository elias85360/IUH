# Grafana in This Project

Access: http://localhost:3000 (default admin/admin; change in prod).

Provisioning (mounted read‑only by compose):

- Datasource: Prometheus at `http://prometheus:9090` (default) – `infra/grafana/provisioning/datasources/datasource.yml`
- Dashboards: folder loader pointing to `/etc/grafana/provisioning/dashboards/json` – `infra/grafana/provisioning/dashboards/dashboards.yml`
- Alerting: example rules for p95 latency and error rate – `infra/grafana/provisioning/alerting/*.json|*.yml`

Suggested Panels (API):

- Request rate: `sum(rate(http_requests_total[5m]))`
- Error rate: `sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))`
- Latency p95: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
- Cache hit ratio: `sum(rate(api_cache_hits_total[5m])) / (sum(rate(api_cache_hits_total[5m])) + sum(rate(api_cache_misses_total[5m])))`
- Points returned: `sum(rate(api_points_returned_total[5m])) by (route)`

Environments:

- Compose mounts provisioning directories from `infra/grafana/provisioning/*`.
- For custom dashboards, export JSON into the `json` folder used by the dashboards provider.

