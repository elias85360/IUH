const { EventEmitter } = require("events");
let settingsStore = null
try { settingsStore = require('./settingsStore') } catch { settingsStore = null }

class DataStore {
  constructor({ devices = [], metrics = [] } = {}) {
    this.emitter = new EventEmitter();
    this.devices = devices;
    this.metrics = metrics; // [{key, unit, displayName, thresholds}]
    // Ring buffer per series using typed arrays for bounded memory
    this.series = new Map(); // key -> { cap, ts: Float64Array, val: Float64Array, idx, len, lastTs }
    this.stats = { points: 0 };
    // Pre-aggregations (Phase 3): maintain hourly and daily buckets for fast queries
    this.preAggBuckets = [60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1h, 1d
    this.preAgg = new Map(); // key: `${deviceId}::${metricKey}::${bucketMs}` -> Map(bucketTs -> { ts, count, sum, min, max })
    this.preAggRetentionDays = Number(process.env.PREAGG_RETENTION_DAYS || 90);
    // Track last alert level per series for hysteresis/deadband
    this._lastLevel = new Map(); // key -> 'ok'|'warn'|'crit'
    // Optional TimescaleDB mirror
    // Optional TimescaleDB mirror
    this.enableTsdb = String(process.env.TSDB_MIRROR || '').toLowerCase() === '1' || !!process.env.DATABASE_URL
    if (this.enableTsdb) {
      try {
        this.tsdb = require('./db/timescale')
        this.tsdb.init().then(()=>{}).catch(()=>{})
      } catch {
        this.enableTsdb = false
      }
    }
  }

  key(deviceId, metricKey) {
    return `${deviceId}::${metricKey}`;
  }

  getDevices() {
    return this.devices;
  }

  getMetrics(deviceId) {
    // For now, all devices expose same metrics; could customize by device
    return this.metrics;
  }

  getMetricDefinition(metricKey) {
    return this.metrics.find((m) => m.key === metricKey);
  }

  _effectiveThreshold(deviceId, metricKey) {
    try {
      if (!settingsStore || !settingsStore.effectiveFor) return null
      const dev = this.devices.find(d => d.id === deviceId) || {}
      const eff = settingsStore.effectiveFor({ deviceId, deviceMeta: dev }) || {}
      return eff[metricKey] || null
    } catch { return null }
  }

  _getOrCreateSeries(deviceId, metricKey) {
    const k = this.key(deviceId, metricKey)
    let buf = this.series.get(k)
    if (!buf) {
      const cap = Math.max(1000, Number(process.env.SERIES_CAP || 20000))
      buf = { cap, ts: new Float64Array(cap), val: new Float64Array(cap), idx: 0, len: 0, lastTs: 0 }
      this.series.set(k, buf)
    }
    return buf
  }

  addPoint(deviceId, metricKey, ts, value) {
    const buf = this._getOrCreateSeries(deviceId, metricKey)
    // enforce numeric values
    const t = Number(ts)
    const v = Number(value)
    // optional monotonic clamp
    const mts = t < buf.lastTs ? buf.lastTs : t
    const i = buf.idx
    buf.ts[i] = mts
    buf.val[i] = v
    buf.idx = (i + 1) % buf.cap
    if (buf.len < buf.cap) buf.len++
    buf.lastTs = mts
    this.stats.points++;
    // Update pre-aggregations
    for (const bucketMs of this.preAggBuckets) {
      this._updatePreAgg(deviceId, metricKey, ts, value, bucketMs)
    }
    if (this.enableTsdb && this.tsdb && this.tsdb.mirrorAddPoint) {
      this.tsdb.mirrorAddPoint({ deviceId, metricKey, ts, value }).catch(()=>{})
    }

    // Threshold check with hysteresis (deadband)
    const def = this.getMetricDefinition(metricKey);
    const eff = this._effectiveThreshold(deviceId, metricKey) || (def && def.thresholds) || {}
    const dir = eff.direction || (metricKey === 'pf' ? 'below' : 'above')
    const warn = eff.warn
    const crit = eff.crit
    const lastKey = this.key(deviceId, metricKey)
    const lastLevel = this._lastLevel.get(lastKey) || 'ok'
    const deadbandPct = Math.max(0, Number((settingsStore && settingsStore.getSettings && settingsStore.getSettings().options && settingsStore.getSettings().options.deadbandPct) || 0))
    const db = deadbandPct / 100
    let level = 'ok'
    if (warn == null && crit == null) level = 'ok'
    else if (dir === 'below') {
      if (crit != null && value <= crit) level = 'crit'
      else if (warn != null && value <= warn) level = 'warn'
      else level = 'ok'
      // hysteresis: to clear from warn/crit back to ok, require rising above thresholds*(1+db)
      if (level === 'ok' && lastLevel !== 'ok') {
        const clearWarn = warn != null ? warn * (1 + db) : null
        const clearCrit = crit != null ? crit * (1 + db) : null
        if (lastLevel === 'crit' && clearCrit != null && value <= clearCrit) level = 'crit'
        else if (lastLevel === 'warn' && clearWarn != null && value <= clearWarn) level = 'warn'
      }
    } else {
      if (crit != null && value >= crit) level = 'crit'
      else if (warn != null && value >= warn) level = 'warn'
      else level = 'ok'
      // hysteresis: to clear to ok, require falling below thresholds*(1-db)
      if (level === 'ok' && lastLevel !== 'ok') {
        const clearWarn = warn != null ? warn * (1 - db) : null
        const clearCrit = crit != null ? crit * (1 - db) : null
        if (lastLevel === 'crit' && clearCrit != null && value >= clearCrit) level = 'crit'
        else if (lastLevel === 'warn' && clearWarn != null && value >= clearWarn) level = 'warn'
      }
    }
    this._lastLevel.set(lastKey, level)

    const payload = { deviceId, metricKey, ts, value, level };
    this.emitter.emit("point", payload);
    if (level === "warn" || level === "crit") this.emitter.emit("alert", payload);
    return payload;
  }

  _preAggKey(deviceId, metricKey, bucketMs) {
    return `${deviceId}::${metricKey}::${bucketMs}`
  }

  _getPreAggMap(deviceId, metricKey, bucketMs) {
    const key = this._preAggKey(deviceId, metricKey, bucketMs)
    let m = this.preAgg.get(key)
    if (!m) { m = new Map(); this.preAgg.set(key, m) }
    return m
  }

  _updatePreAgg(deviceId, metricKey, ts, value, bucketMs) {
    const m = this._getPreAggMap(deviceId, metricKey, bucketMs)
    const b = Math.floor(ts / bucketMs) * bucketMs
    let agg = m.get(b)
    if (!agg) { agg = { ts: b, count: 0, sum: 0, min: value, max: value }; m.set(b, agg) }
    agg.count += 1; agg.sum += value; if (value < agg.min) agg.min = value; if (value > agg.max) agg.max = value
    // Trim old buckets beyond retention
    const keepAfter = Date.now() - this.preAggRetentionDays * 24 * 60 * 60 * 1000
    if (m.size > 0) {
      // Remove from the oldest side if necessary
      for (const [tsKey] of m) { if (tsKey < keepAfter) m.delete(tsKey); else break }
    }
  }

  _iterateSeries(buf, fromTs, toTs, cb) {
    if (!buf || buf.len === 0) return
    const cap = buf.cap
    // oldest index
    let pos = (buf.idx - buf.len + cap) % cap
    for (let n = 0; n < buf.len; n++) {
      const ts = buf.ts[pos]
      if (ts >= fromTs && ts <= toTs) cb(ts, buf.val[pos])
      pos = (pos + 1) % cap
    }
  }

  querySeries({ deviceId, metricKey, from, to, limit, bucketMs }) {
    const buf = this.series.get(this.key(deviceId, metricKey));
    const fromTs = typeof from === "number" ? from : 0;
    const toTs = typeof to === "number" ? to : Number.MAX_SAFE_INTEGER;
    // Use pre-aggregations if bucketMs is coarse enough
    const usePreAgg = Number(bucketMs) >= (60 * 60 * 1000)
    if (!bucketMs || bucketMs <= 0) {
      const out = []
      this._iterateSeries(buf, fromTs, toTs, (ts, v) => { out.push({ ts, value: v }) })
      if (limit && out.length > limit) return out.slice(-limit)
      return out
    }
    if (usePreAgg) {
      // Choose 1h pre-agg if bucketMs < 1d, else 1d
      const chosen = Number(bucketMs) < (24 * 60 * 60 * 1000) ? (60 * 60 * 1000) : (24 * 60 * 60 * 1000)
      const m = this._getPreAggMap(deviceId, metricKey, chosen)
      const out = []
      for (const [b, agg] of m) {
        if (b < fromTs || b > toTs) continue
        out.push({ ts: agg.ts, value: agg.sum / Math.max(1, agg.count), min: agg.min, max: agg.max, count: agg.count, sum: agg.sum })
      }
      out.sort((a,b)=>a.ts-b.ts)
      if (limit && out.length > limit) return out.slice(-limit)
      return out
    }
    // Aggregate by bucketMs (avg, min, max, count, sum) on raw points for fine-grain
    const buckets = new Map();
    this._iterateSeries(buf, fromTs, toTs, (ts, v) => {
      const b = Math.floor(ts / bucketMs) * bucketMs
      let agg = buckets.get(b)
      if (!agg) { agg = { ts: b, count: 0, min: v, max: v, sum: 0 }; buckets.set(b, agg) }
      agg.count += 1; agg.sum += v; if (v < agg.min) agg.min = v; if (v > agg.max) agg.max = v
    })
    const result = Array.from(buckets.values()).sort((a,b)=>a.ts-b.ts).map(b => ({ ts: b.ts, value: b.sum/Math.max(1,b.count), min: b.min, max: b.max, count: b.count, sum: b.sum }))
    if (limit && result.length > limit) return result.slice(-limit)
    return result
  }

  getKpis({ deviceId, from, to }) {
    const metrics = this.getMetrics(deviceId);
    const now = Date.now();
    const fromTs = typeof from === "number" ? from : now - 60 * 60 * 1000; // default 1h
    const toTs = typeof to === "number" ? to : now;
    const kpis = {};
    for (const m of metrics) {
      const series = this.querySeries({ deviceId, metricKey: m.key, from: fromTs, to: toTs });
      if (series.length === 0) {
        kpis[m.key] = { last: null, min: null, max: null, avg: null, unit: m.unit };
        continue;
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      for (const p of series) {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
        sum += p.value;
      }
      const avg = sum / series.length;
      const last = series[series.length - 1].value;
      kpis[m.key] = { last, min, max, avg, unit: m.unit };
    }
    return kpis;
  }

  diagnostics() {
    const keys = Array.from(this.series.keys());
    const counts = keys.map((k) => ({ key: k, count: this.series.get(k)?.length || 0 }));
    const total = counts.reduce((a, c) => a + c.count, 0);
    const now = Date.now();
    return {
      devices: this.devices.length,
      metrics: this.metrics.length,
      seriesKeys: keys.length,
      totalPoints: total,
      uptimeMs: process.uptime() * 1000,
      now,
    };
  }
}

module.exports = { DataStore };
