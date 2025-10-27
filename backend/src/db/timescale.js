// Optional TimescaleDB integration (mirror writes; queries can be wired later).
// Requires: npm i pg (not installed by default).

let pg
try { pg = require('pg') } catch { pg = null }

let pool = null
function getPool() {
  if (!process.env.DATABASE_URL) return null
  if (!pg) return null
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    pool.on('error', () => {})
  }
  return pool
}

async function init() {
  const p = getPool(); if (!p) return false
  const sql = `
  create table if not exists metrics (
    device_id text not null,
    metric_key text not null,
    ts timestamptz not null,
    value double precision not null
  );
  do $$ begin
    perform create_hypertable('metrics','ts', if_not_exists => true);
  exception when undefined_function then null; end $$;
  create index if not exists idx_metrics_device_metric_ts on metrics(device_id, metric_key, ts desc);
  `
  try { await p.query(sql); return true } catch { return false }
}

async function mirrorAddPoint({ deviceId, metricKey, ts, value }) {
  const p = getPool(); if (!p) return
  try {
    await p.query('insert into metrics(device_id, metric_key, ts, value) values ($1,$2,to_timestamp($3/1000.0),$4)', [deviceId, metricKey, ts, value])
  } catch {}
}

async function initContinuousAggregates() {
  const p = getPool(); if (!p) return false
  const sql = `
  create materialized view if not exists cagg_hour
  with (timescaledb.continuous) as
  select device_id, metric_key,
         time_bucket('1 hour', ts) as bucket,
         count(*) as count,
         avg(value) as avg,
         min(value) as min,
         max(value) as max,
         sum(value) as sum
  from metrics
  group by device_id, metric_key, bucket
  with no data;

  create materialized view if not exists cagg_day
  with (timescaledb.continuous) as
  select device_id, metric_key,
         time_bucket('1 day', ts) as bucket,
         count(*) as count,
         avg(value) as avg,
         min(value) as min,
         max(value) as max,
         sum(value) as sum
  from metrics
  group by device_id, metric_key, bucket
  with no data;

  create index if not exists idx_cagg_hour on cagg_hour(device_id, metric_key, bucket desc);
  create index if not exists idx_cagg_day on cagg_day(device_id, metric_key, bucket desc);
  `
  try { await p.query(sql); return true } catch { return false }
}

async function refreshCaggs(fromIso, toIso) {
  const p = getPool(); if (!p) return false
  const sql = `
    call refresh_continuous_aggregate('cagg_hour', $1::timestamptz, $2::timestamptz);
    call refresh_continuous_aggregate('cagg_day',  $1::timestamptz, $2::timestamptz);
  `
  try { await p.query(sql, [fromIso, toIso]); return true } catch { return false }
}

async function querySeries({ deviceId, metricKey, from, to, bucketMs }) {
  const p = getPool(); if (!p) return null
  const fromIso = from ? new Date(Number(from)).toISOString() : new Date(Date.now() - 3600_000).toISOString()
  const toIso = to ? new Date(Number(to)).toISOString() : new Date().toISOString()
  const ms = Number(bucketMs) || 0
  let rows = []
  if (ms >= 86_400_000) {
    // Use daily cagg
    const q = `select bucket as ts, avg, min, max, sum, count
               from cagg_day where device_id=$1 and metric_key=$2 and bucket between $3::timestamptz and $4::timestamptz
               order by bucket asc`
    const r = await p.query(q, [deviceId, metricKey, fromIso, toIso])
    rows = r.rows.map(x => ({ ts: Date.parse(x.ts), value: Number(x.avg), min: Number(x.min), max: Number(x.max), count: Number(x.count), sum: Number(x.sum) }))
  } else if (ms >= 3_600_000) {
    // Use hourly cagg
    const q = `select bucket as ts, avg, min, max, sum, count
               from cagg_hour where device_id=$1 and metric_key=$2 and bucket between $3::timestamptz and $4::timestamptz
               order by bucket asc`
    const r = await p.query(q, [deviceId, metricKey, fromIso, toIso])
    rows = r.rows.map(x => ({ ts: Date.parse(x.ts), value: Number(x.avg), min: Number(x.min), max: Number(x.max), count: Number(x.count), sum: Number(x.sum) }))
  } else if (ms > 0) {
    // Raw aggregation with dynamic bucket
    const q = `select time_bucket($5::interval, ts) as bucket,
                      count(*) as count, avg(value) as avg, min(value) as min, max(value) as max, sum(value) as sum
               from metrics
               where device_id=$1 and metric_key=$2 and ts between $3::timestamptz and $4::timestamptz
               group by bucket
               order by bucket asc`
    const interval = `${ms} milliseconds`
    const r = await p.query(q, [deviceId, metricKey, fromIso, toIso, interval])
    rows = r.rows.map(x => ({ ts: Date.parse(x.bucket), value: Number(x.avg), min: Number(x.min), max: Number(x.max), count: Number(x.count), sum: Number(x.sum) }))
  } else {
    // Raw points
    const q = `select extract(epoch from ts)*1000 as ts, value from metrics
               where device_id=$1 and metric_key=$2 and ts between $3::timestamptz and $4::timestamptz
               order by ts asc limit 100000`
    const r = await p.query(q, [deviceId, metricKey, fromIso, toIso])
    rows = r.rows.map(x => ({ ts: Number(x.ts), value: Number(x.value) }))
  }
  return rows
}

async function queryKpis({ deviceId, from, to }) {
  const p = getPool(); if (!p) return null
  const fromIso = from ? new Date(Number(from)).toISOString() : new Date(Date.now() - 3600_000).toISOString()
  const toIso = to ? new Date(Number(to)).toISOString() : new Date().toISOString()
  const out = {}
  // For each metricKey present in the table for the device, compute stats
  const metrics = await p.query('select distinct metric_key from metrics where device_id=$1', [deviceId])
  for (const row of metrics.rows) {
    const mk = row.metric_key
    const q = `select
                 (select value from metrics where device_id=$1 and metric_key=$2 and ts between $3::timestamptz and $4::timestamptz order by ts desc limit 1) as last,
                 min(value) as min,
                 max(value) as max,
                 avg(value) as avg
               from metrics
               where device_id=$1 and metric_key=$2 and ts between $3::timestamptz and $4::timestamptz`
    const r = await p.query(q, [deviceId, mk, fromIso, toIso])
    const x = r.rows[0] || {}
    out[mk] = { last: x.last == null ? null : Number(x.last), min: x.min == null ? null : Number(x.min), max: x.max == null ? null : Number(x.max), avg: x.avg == null ? null : Number(x.avg) }
  }
  return out
}

module.exports = { init, mirrorAddPoint, initContinuousAggregates, refreshCaggs, querySeries, queryKpis }
