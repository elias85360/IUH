# Dashboard Charts & What They Show

This page summarizes the main screens and charts in the UI and the insights they provide.

Home (Overview)

- KPIs per device and metric
  - Last value, min/max/avg over the selected period
  - Purpose: quick health snapshot and outlier spotting
- Timeseries charts (by device/metric)
  - Supports bucketization (client/server) and zoom via `bucketMs`
  - Purpose: trend analysis, anomaly detection, spikes/drifts
- Live updates
  - Socket.IO pushes `point` and `alert` events to update charts in real time

Devices

- Device list with tags/rooms
  - Purpose: inventory and filtering for analysis
- Device detail view
  - One chart per metric for the device, synchronized crosshair
  - Purpose: focused troubleshooting for a single asset

Alerts

- List of alert events (warn/crit) with timestamps and metric values
  - Purpose: incident triage and recent anomalies

Assets

- Editable metadata (name, group, room, tags, description)
  - Purpose: maintain a consistent taxonomy for dashboards and filters

Settings

- Thresholds editor (global/group/room/device) and options (z‑score, deadband, email notify)
  - Purpose: tune alert sensitivity and visualization thresholds

Data Health

- Freshness: age of last point per device/metric
- Completeness: expected vs. present buckets in the period
- Gaps: number of missing buckets
  - Purpose: data quality monitoring and ingestion validation

Exports

- CSV and PDF (optional) for offline analysis and reporting

Notes

- Metrics supported: U (V), I (A), P (W), E (Wh), F (Hz), pf, temp (°C), humid (%)
- In master mode, raw data is fetched from Kienlab and bucketized client‑side; otherwise series are served by the backend (in‑memory or Timescale aggregates)

