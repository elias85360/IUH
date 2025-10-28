# ADR 002 – TimescaleDB Mirror & Aggregates

Decision: Mirror incoming points to TimescaleDB and optionally serve reads from DB with continuous aggregates.

Context: Need persistence, historical analytics, and efficient aggregates.

Implications: `TSDB_MIRROR=1` for writes; enable `TSDB_READ=1` when DB is provisioned; set retention and refresh policies.

