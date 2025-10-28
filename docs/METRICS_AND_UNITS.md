# Metrics & Units

Supported metrics (defaults align with backend `src/config.js`):

- U (Voltage, V): Electrical potential difference. Typical baseline ~230 V. Warn 240, Crit 250.
- I (Current, A): Electrical current intensity. Warn 15 A, Crit 20 A.
- P (Power, W): Active power consumption. Warn 2000 W, Crit 3000 W.
- E (Energy, Wh): Cumulative energy. No default thresholds (informational).
- F (Frequency, Hz): AC frequency. Warn 51 Hz, Crit 52 Hz.
- pf (Power factor): Ratio of real to apparent power. Direction: below (warn 0.8, crit 0.7).
- temp (Temperature, °C): Thermal metric. Warn 28 °C, Crit 32 °C (example).
- humid (Humidity, %): Relative humidity. Warn 70 %, Crit 85 %.

Notes:

- Direction: For metrics like pf, alerts trigger when values go below thresholds; for others, when going above.
- Per-device overrides: Backend and UI allow device-level overrides for thresholds.
- Units: All chart axes and KPIs display units alongside values.
