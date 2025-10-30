import { api } from '../services/api.js'
import { bucketForSpan } from './format.js'

function bucketFor(ms) { return bucketForSpan(ms) }

export async function prefetchHome(devices, period) {
  if (!devices || !devices.length) return
  const from = Date.now() - period.ms
  const to = Date.now() 
  const bucketMs = bucketFor(period.ms)
  const metrics = ['E','P']
  const tasks = []
  for (const d of devices) {
    for (const m of metrics) {
      tasks.push(api.timeseries(d.id, m, { from, to, bucketMs }))
    }
  }
  // Limit concurrency to avoid overwhelming the proxy
  const max = 6
  let i = 0
  async function runNext() {
    if (i >= tasks.length) return
    const t = tasks[i++]
    try { await t } catch {}
    return runNext()
  }
  const workers = Array.from({ length: Math.min(max, tasks.length) }, runNext)
  await Promise.all(workers)
  console.log('Prefetching for devices:', devices)

}

export async function prefetchDevices(devices, period) {
  if (!devices || !devices.length) return
  const from = Date.now() - period.ms
  const to = Date.now()
  const bucketMs = bucketFor(period.ms)
  const metrics = ['U','I','P','pf','temp','E']
  const tasks = []
  for (const d of devices) {
    for (const m of metrics) {
      tasks.push(api.timeseries(d.id, m, { from, to, bucketMs }))
    }
  }
  const max = 8
  let i = 0
  async function runNext() {
    if (i >= tasks.length) return
    const t = tasks[i++]
    try { await t } catch {}
    return runNext()
  }
  const workers = Array.from({ length: Math.min(max, tasks.length) }, runNext)
  await Promise.all(workers)
}
