# Dashboard User Guide

Navigation

- Home: overview KPIs and timeseries by device/metric.
- Devices: inventory and per-device details.
- Alerts: stream/history of threshold crossings.
- Assets: metadata editor (names, rooms, tags, exclusion).
- Settings: thresholds and visualization options.
- Data Health: freshness, completeness, gaps, heatmap.

Top Controls

- Se connecter/Se déconnecter: OIDC login/logout (Keycloak).
- Date badge: current date.
- Charger les données: initial fetch of devices/metrics; must be clicked once per session.
- Share Link: copies a permalink with filters (period/room/group/layout).
- Save Scene: saves current layout and filters locally.

Interactions

- Hover to cross-highlight: vertical line synchronized across charts.
- Legend toggles: show/hide metrics (where available).
- Zoom by period: switch between presets; auto bucket size adapts.
- Subscribe live: charts update in real time when Live is enabled.

Device Detail

- Metric selector: choose one or multiple metrics.
- Chart type: line/area/bar/scatter (per UI option).
- Smoothing: SMA/EMA and window size.
- Y-scale: linear/logarithmic.

Data Health

- Freshness badges: age of last point per device/metric (color: ok/warn/crit).
- Completeness bar: percentage of expected buckets present.
- Gaps: missing buckets count.
- Heatmap (hour × day): visual distribution of presence by hour for the selected series.

Export

- CSV: `/api/export.csv?deviceId=&metricKey=&from=&to=`.
- PDF (optional): `/api/export.pdf?deviceId=&from=&to=&title=`.
