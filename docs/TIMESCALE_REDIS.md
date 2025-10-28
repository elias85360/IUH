# TimescaleDB & Redis

Timescale (PostgreSQL):

- Image: `timescale/timescaledb:2.14.2-pg14`, DB `iot`, password `postgres` (dev)
- Enable mirror writes: `TSDB_MIRROR=1` with `DATABASE_URL`
- Enable reads: `TSDB_READ=1` to serve KPIs/series from DB
- Continuous aggregates initialized at startup when DB is configured
- Optional periodic refresh: `TSDB_REFRESH_SECONDS`

Redis:

- URL: `redis://redis:6379`
- Used for API response cache and HMAC nonce store

