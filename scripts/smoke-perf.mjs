#!/usr/bin/env node
// Simple smoke performance test using autocannon.
// Usage: node scripts/smoke-perf.mjs http://localhost:4000  (optional base URL)

import autocannon from 'autocannon'

const base = process.argv[2] || 'http://localhost:4000'
const duration = Number(process.env.DURATION || 30)

async function run() {
  console.log('Running smoke perf against', base)
  const instances = [
    { url: `${base}/api/health` },
    { url: `${base}/api/devices` },
    { url: `${base}/api/metrics` },
    { url: `${base}/api/timeseries?deviceId=dev-1&metricKey=P&bucketMs=60000` },
    { url: `${base}/api/kpis?deviceId=dev-1` },
  ]
  for (const t of instances) {
    console.log('\n===', t.url)
    const res = await autocannon({ url: t.url, duration, connections: 20, pipelining: 1 })
    console.log('p95(ms)=', res.latency.p95, 'p99(ms)=', res.latency.p99, 'errors=', res.errors)
  }
}

run().catch(e => { console.error(e); process.exit(1) })

