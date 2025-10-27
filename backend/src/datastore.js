const { EventEmitter } = require("events");

class DataStore {
  constructor({ devices = [], metrics = [] } = {}) {
    this.emitter = new EventEmitter();
    this.devices = devices;
    this.metrics = metrics; // [{key, unit, displayName, thresholds}]
    this.series = new Map(); // key: `${deviceId}::${metricKey}` -> [{ts,value}]
    this.stats = { points: 0 };
    // Pre-aggregations (Phase 3): maintain hourly and daily buckets for fast queries
    this.preAggBuckets = [60 * 60 * 1000, 24 * 60 * 60 * 1000]; // 1h, 1d
    this.preAgg = new Map(); // key: `${deviceId}::${metricKey}::${bucketMs}` -> Map(bucketTs -> { ts, count, sum, min, max })
    this.preAggRetentionDays = Number(process.env.PREAGG_RETENTION_DAYS || 90);
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

  addPoint(deviceId, metricKey, ts, value) {
    const k = this.key(deviceId, metricKey);
    let arr = this.series.get(k);
    if (!arr) {
      arr = [];
      this.series.set(k, arr);
    }
    const point = { ts, value };
    arr.push(point);
    // Keep only recent N to bound memory (dev mode). Adjust as needed.
    if (arr.length > 20000) arr.splice(0, arr.length - 20000);
    this.stats.points++;
    // Update pre-aggregations
    for (const bucketMs of this.preAggBuckets) {
      this._updatePreAgg(deviceId, metricKey, ts, value, bucketMs)
    }
    if (this.enableTsdb && this.tsdb && this.tsdb.mirrorAddPoint) {
      this.tsdb.mirrorAddPoint({ deviceId, metricKey, ts, value }).catch(()=>{})
    }

    // Threshold check
    const def = this.getMetricDefinition(metricKey);
    let level = "ok";
    if (def && def.thresholds) {
      const { warn, crit } = def.thresholds;
      if (crit !== undefined && value >= crit) level = "crit";
      else if (warn !== undefined && value >= warn) level = "warn";
    }

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

  querySeries({ deviceId, metricKey, from, to, limit, bucketMs }) {
    const k = this.key(deviceId, metricKey);
    const arr = this.series.get(k) || [];
    const fromTs = typeof from === "number" ? from : 0;
    const toTs = typeof to === "number" ? to : Number.MAX_SAFE_INTEGER;
    // Use pre-aggregations if bucketMs is coarse enough
    const usePreAgg = Number(bucketMs) >= (60 * 60 * 1000)
    if (!bucketMs || bucketMs <= 0) {
      const filtered = arr.filter((p) => p.ts >= fromTs && p.ts <= toTs);
      if (limit && filtered.length > limit) return filtered.slice(-limit);
      return filtered;
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
    const filtered = arr.filter((p) => p.ts >= fromTs && p.ts <= toTs);
    const buckets = new Map();
    for (const p of filtered) {
      const b = Math.floor(p.ts / bucketMs) * bucketMs;
      let agg = buckets.get(b);
      if (!agg) { agg = { ts: b, count: 0, min: p.value, max: p.value, sum: 0 }; buckets.set(b, agg) }
      agg.count += 1; agg.sum += p.value; if (p.value < agg.min) agg.min = p.value; if (p.value > agg.max) agg.max = p.value;
    }
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
