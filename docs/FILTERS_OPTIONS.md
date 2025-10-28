# Filters & Analysis Options

Filters (UI Store)

- Period (`period`): presets with key/label/ms: 1h, 24h, 7d, 30d, 6mo, 1y. Changes time window and triggers prefetch.
- Anchor Now (`anchorNow`): reference timestamp for the period window.
- Selected Types (`selectedTypes`): filter by device type (when provided).
- Selected Metrics (`selectedMetrics`): restrict visible metrics (also used by live updates to reduce noise).
- Room (`selectedRoom`): filter devices by room; `'all'` to disable.
- Tags (`selectedTags`): filter by custom tags.
- Devices (`selectedDevices`): subset selection.
- Excluded Devices (`excludedDevices`): locally hidden devices; can also be persisted via Assets Meta `exclude: true`.
- Search (`searchDevice`): text filter on device name/id.
- Pagination (`page`, `pageSize`): control list/grid pagination.

Visualization & Analysis

- Live (`live`): toggle realtime updates via Socket.IO.
- Bucket Size (`bucketMs`): explicit aggregation bucket (ms). When undefined, an auto strategy targets ~120 points.
- Aggregation Preset (`aggregation`): semantic scales: auto, 1min, 10min, hour, day, week, month (maps to bucketMs).
- Smoothing (`smoothing`): enable smoothing on charts.
- Smoothing Mode (`options.smoothingMode`): SMA (simple) or EMA (exponential).
- Smoothing Window (`options.smoothingWindow`): window length for smoothing.
- Highlight Anomalies (`highlightAnomalies`): visually mark outliers.
- Anomaly Z (`options.anomalyZ`): z-score threshold for anomaly highlighting (default 3).
- Baseline (`options.showBaseline`): display expected baseline band when available.
- Forecast (`options.showForecast`): overlay forecasted series when backend/microservice available.
- Chart Type (`chartType`): line | area | bar | scatter.
- Y‑Scale (`options.yScale`): linear | log.
- Theme (`options.theme`): dark | light.
- Language (`options.lang`): fr | en.

Thresholds & Alerts

- Thresholds: per-metric defaults and per-device overrides (warn/crit, direction).
- Deadband (`options.deadbandPct`, backend settings): reduces flapping by ignoring small changes near thresholds.
- Email/Webhook routing: configured in backend; UI shows toasts for alerts.

Effective Thresholds API

- `GET /api/thresholds/effective?deviceId=...` returns the computed thresholds for a device (global → group → room → device → options overrides).
