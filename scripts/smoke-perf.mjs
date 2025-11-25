#!/usr/bin/env node
// Simple smoke performance test using autocannon.
// Usage: node scripts/smoke-perf.mjs http://localhost:4000  (optional base URL)

let autocannon
try {
  autocannon = (await import('autocannon')).default || (await import('autocannon'))
} catch (e) {
  console.warn('autocannon non installé; lancez `npm install autocannon` pour activer le smoke perf.')
  process.exit(0)
}

const base = process.argv[2] || 'http://localhost:4000'
const duration = Number(process.env.DURATION || 30)
const p95Max = Number(process.env.P95_MAX || 800)
const p99Max = Number(process.env.P99_MAX || 1200)

async function run() {
  console.log('Running smoke perf against', base)
  const instances = [
    { url: `${base}/api/health` },
    { url: `${base}/api/devices` },
    { url: `${base}/api/metrics` },
    { url: `${base}/api/timeseries?deviceId=dev-1&metricKey=P&bucketMs=60000` },
    { url: `${base}/api/kpis?deviceId=dev-1` },
  ]
  let failed = false
  for (const t of instances) {
    console.log('\n===', t.url)
    const res = await autocannon({ url: t.url, duration, connections: 20, pipelining: 1 })
    console.log('p95(ms)=', res.latency.p95, 'p99(ms)=', res.latency.p99, 'errors=', res.errors)
    if (res.latency.p95 > p95Max || res.latency.p99 > p99Max || res.errors > 0) {
      failed = true
      console.error('Threshold exceeded for', t.url)
    }
  }
  if (failed) {
    console.error('Smoke perf failed thresholds.')
    process.exit(1)
  }
}

run().catch(e => { console.error(e); process.exit(1) })

