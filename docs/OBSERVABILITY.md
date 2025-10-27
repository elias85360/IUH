# Observability

- Metrics: Prometheus scrape `/metrics` on API; include request latency, rate, errors, cache hit ratio, queue lengths.
- Traces: OpenTelemetry exporter to OTLP endpoint; trace API calls, DB queries, cache, and external calls.
- Logs: Structured JSON; correlation IDs; PII scrubbing; centralize (Loki/ELK).
- Dashboards: Grafana panels for traffic, p95 latency, error rate, anomaly rate, export activity.
- Alerts: SLO-based alerts; anomaly spike; data freshness; queue backlog; auth failure rate.
