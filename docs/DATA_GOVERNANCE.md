# Data Governance

- Metric registry: key, unit, ranges, display name, tags
- Timezone: store and serve timestamps in UTC; convert at edges
- Gaps: flag missing buckets; only interpolate for visualization
- Quality: freshness, completeness, consistency KPIs via `/api/quality`
- Validation: Zod schemas at API boundaries
- Retention: raw vs aggregated retention; Timescale CAGGs
- Access: RBAC per role; audit export and settings changes

