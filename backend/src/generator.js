const { randomUUID } = require("crypto");

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function gaussianNoise(stdDev = 1) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev;
}

/** 
 * Starts a mock data generator producing points for all devices/metrics.
 * Emits "point" and "alert" via store.emitter through store.addPoint().
 */
function startGenerator({ store, config }) {
  const { devices, metrics, baselines, generator } = config;
  const { intervalMs, jitter } = generator;

  // Per device/metric state to simulate slow drifts and occasional spikes
  const state = new Map();
  function stateKey(d, m) { return `${d.id}::${m.key}`; }

  function nextValue(device, metric) {
    const baseCfg = (baselines[device.type] || {})[metric.key] || { base: 0, noise: 1 };
    const k = stateKey(device, metric);
    let s = state.get(k);
    if (!s) { s = { drift: 0, last: baseCfg.base }; state.set(k, s); }
    // drift slowly
    s.drift = clamp(s.drift + gaussianNoise(baseCfg.noise * 0.02), -baseCfg.noise * 2, baseCfg.noise * 2);
    // baseline + noise + drift
    let value = baseCfg.base + gaussianNoise(baseCfg.noise) + s.drift;
    // occasional spikes to trigger alerts (for P, I, temp)
    if (["P","I","temp"].includes(metric.key) && Math.random() < 0.03) {
      value += baseCfg.noise * (3 + Math.random() * 4);
    }
    // jitter percentage
    value *= 1 + (Math.random() * 2 - 1) * jitter;
    // ensure physical ranges
    if (metric.key === 'pf') value = clamp(value, 0, 1);
    s.last = value;
    return value;
  }

  const timer = setInterval(() => {
    const ts = Date.now();
    for (const d of devices) {
      for (const m of metrics) {
        const value = nextValue(d, m);
        store.addPoint(d.id, m.key, ts, value);
      }
    }
  }, intervalMs);

  return {
    id: randomUUID(),
    stop: () => clearInterval(timer),
    intervalMs,
  };
}

module.exports = { startGenerator };
