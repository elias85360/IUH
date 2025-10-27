# Data Governance

- Metric registry: key, unit, ranges, precision, conversions, display name, tags.
- Timezone: store timestamps in UTC; convert at edges.
- Gaps: flag missing buckets; backfill rules; interpolate only for visualization.
- Data quality: freshness, completeness, consistency KPIs; health dashboard.
- ETL rules: ingress validation (Zod/AJV), deduplication, normalization, enrichment.
- Retention: raw vs. aggregated retention periods; tiered storage.
- Access: RBAC per metric/device; audit data exports and schema changes.
