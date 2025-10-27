const express = require("express");
const { z } = require("zod");
const { apiKeyMiddleware, hmacMiddleware, recordAudit, requireAuth, requireRole } = require("./security");
const { cacheGet, cacheSet, makeKey } = require('./cache')
const { weakEtag } = require('./util/etag')
let tsdb = null
try { tsdb = require('./db/timescale') } catch {}
const { recordCacheHit, recordCacheMiss } = require('./metrics')
const { withSpan, spanAddEvent } = require('./otel')
const { getMeta: getAssetsMeta, setMeta: setAssetsMeta } = require('./assetsMeta')
const { getSettings, setSettings, effectiveFor } = require('./settingsStore')
let pdf = null
try { pdf = require('./pdf') } catch {}

function buildApi({ app, store, mailer }) {
  const router = express.Router();
 
  const RBAC_ENFORCE = String(process.env.RBAC_ENFORCE || '') === '1'
  router.use(apiKeyMiddleware(!!process.env.API_KEY));
  router.use(hmacMiddleware(String(process.env.API_HMAC_ENFORCE || '') === '1'));
  router.use(requireAuth(RBAC_ENFORCE));

  router.get("/health", (req, res) => {
    res.json({ ok: true, diagnostics: store.diagnostics() });
  });

  // ------- Assets meta (RBAC: viewer read, analyst/admin write) -------
  router.get('/assets/meta', requireRole('viewer', RBAC_ENFORCE), (_req, res) => {
    res.json({ meta: getAssetsMeta() })
  })
  router.put('/assets/meta', requireRole('analyst', RBAC_ENFORCE), recordAudit('assets.meta.update'), (req, res) => {
    const schema = z.object({ updates: z.record(z.object({
      name: z.string().optional(),
      group: z.string().optional(),
      room: z.string().optional(),
      tags: z.array(z.string()).optional(),
      description: z.string().optional(),
    })), replace: z.boolean().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.errors })
    const next = setAssetsMeta(parsed.data.updates, !!parsed.data.replace)
    res.json({ ok: true, meta: next })
  })

  // ------- Thresholds settings (RBAC: admin write) -------
  router.get('/settings/thresholds', requireRole('viewer', RBAC_ENFORCE), (_req, res) => {
    res.json(getSettings())
  })
  router.put('/settings/thresholds', requireRole('admin', RBAC_ENFORCE), recordAudit('settings.thresholds.update'), (req, res) => {
    const schema = z.object({
      global: z.record(z.any()).optional(),
      groups: z.record(z.any()).optional(),
      rooms: z.record(z.any()).optional(),
      devices: z.record(z.any()).optional(),
      options: z.object({ zScore: z.number().optional(), emailNotify: z.boolean().optional(), deadbandPct: z.number().optional() }).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.errors })
    const next = setSettings(parsed.data, false)
    res.json({ ok: true, settings: next })
  })
  router.get('/thresholds/effective', requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    const schema = z.object({ deviceId: z.string().min(1) })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid params', details: parsed.error.errors })
    const { deviceId } = parsed.data
    const meta = getAssetsMeta()[deviceId] || {}
    const eff = effectiveFor({ deviceId, deviceMeta: meta })
    res.json({ deviceId, thresholds: eff })
  })

  router.get("/devices", requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    res.json({ devices: store.getDevices() });
  });

  router.get("/metrics", requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    const { deviceId } = req.query;
    // same metrics for all devices in this mock
    res.json({ metrics: store.getMetrics(deviceId) });
  });

  router.get("/kpis", requireRole('viewer', RBAC_ENFORCE), async (req, res) => withSpan('api.kpis', async () => {
    const schema = z.object({
      deviceId: z.string().min(1),
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
    });
    const parse = schema.safeParse(req.query);
    if (!parse.success) return res.status(400).json({ error: "invalid params", details: parse.error.errors });
    const { deviceId, from, to } = parse.data;
    try { spanAddEvent('params', { deviceId }); } catch {}
    const key = makeKey('kpis', { deviceId, from, to })
    const cached = await cacheGet(key)
    if (cached) {
      try { recordCacheHit('/api/kpis') } catch {}
      const tag = weakEtag(cached)
      if (tag && req.headers['if-none-match'] === tag) return res.status(304).end()
      if (tag) res.setHeader('ETag', tag)
      res.setHeader('Cache-Control', 'public, max-age=5')
      return res.json(cached)
    }
    try { recordCacheMiss('/api/kpis') } catch {}
    let kpis
    const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.queryKpis
    if (useTsdb) {
      try { kpis = await tsdb.queryKpis({ deviceId, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined }) } catch {}
    }
    if (!kpis) kpis = store.getKpis({ deviceId, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined });
    const payload = { deviceId, kpis }
    const tag = weakEtag(payload); if (tag) res.setHeader('ETag', tag)
    res.setHeader('Cache-Control', 'public, max-age=5')
    await cacheSet(key, payload, 5)
    res.json(payload);
  }));

  router.get("/timeseries", requireRole('viewer', RBAC_ENFORCE), async (req, res) => withSpan('api.timeseries', async () => {
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      bucketMs: z.string().regex(/^\d+$/).optional(),
    });
    const parse = schema.safeParse(req.query);
    if (!parse.success) return res.status(400).json({ error: "invalid params", details: parse.error.errors });
    const { deviceId, metricKey, from, to, limit, bucketMs } = parse.data;
    try { spanAddEvent('params', { deviceId, metricKey }); } catch {}
    const key = makeKey('series', { deviceId, metricKey, from, to, limit, bucketMs })
    const cached = await cacheGet(key)
    if (cached) {
      try { recordCacheHit('/api/timeseries') } catch {}
      const tag = weakEtag(cached)
      if (tag && req.headers['if-none-match'] === tag) return res.status(304).end()
      if (tag) res.setHeader('ETag', tag)
      res.setHeader('Cache-Control', 'public, max-age=5')
      return res.json(cached)
    }
    try { recordCacheMiss('/api/timeseries') } catch {}
    const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.querySeries
    let data
    if (useTsdb) {
      try {
        data = await tsdb.querySeries({ deviceId, metricKey, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined, bucketMs: bucketMs ? Number(bucketMs) : undefined })
      } catch {}
    }
    if (!data) {
      data = store.querySeries({
        deviceId,
        metricKey,
        from: from ? Number(from) : undefined,
        to: to ? Number(to) : undefined,
        limit: limit ? Number(limit) : undefined,
        bucketMs: bucketMs ? Number(bucketMs) : undefined,
      });
    }
    const payload = { deviceId, metricKey, points: data }
    const tag = weakEtag(payload); if (tag) res.setHeader('ETag', tag)
    res.setHeader('Cache-Control', 'public, max-age=5')
    await cacheSet(key, payload, 5)
    res.json(payload);
  }));

  router.get("/diagnostics", requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    res.json(store.diagnostics());
  });

  // Data quality and health summary per device/metric
  router.get('/quality', requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    const schema = z.object({
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
      bucketMs: z.string().regex(/^\d+$/).optional(),
      detail: z.string().regex(/^[01]$/).optional(),
    })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    const now = Date.now()
    const from = parse.data.from ? Number(parse.data.from) : (now - 24*60*60*1000)
    const to = parse.data.to ? Number(parse.data.to) : now
    const bucketMs = parse.data.bucketMs ? Number(parse.data.bucketMs) : 60*60*1000
    const wantDetail = parse.data.detail === '1'
    const out = []
    for (const d of store.getDevices()) {
      for (const m of store.getMetrics(d.id)) {
        const points = store.querySeries({ deviceId: d.id, metricKey: m.key, from, to })
        const lastTs = points.length ? points[points.length-1].ts : null
        const freshnessMs = lastTs != null ? Math.max(0, now - Number(lastTs)) : null
        // completeness on bucketed view
        const buckets = new Set()
        for (const p of points) {
          const b = Math.floor(Number(p.ts) / bucketMs) * bucketMs
          buckets.add(b)
        }
        const expected = Math.max(0, Math.floor((to - from) / bucketMs))
        const present = buckets.size
        const completeness = expected > 0 ? present / expected : 1
        const item = {
          deviceId: d.id,
          deviceName: d.name,
          metricKey: m.key,
          unit: m.unit,
          lastTs,
          freshnessMs,
          bucketsPresent: present,
          bucketsExpected: expected,
          completeness,
          gaps: Math.max(0, expected - present),
        }
        if (wantDetail) item.presentBuckets = Array.from(buckets.values()).sort((a,b)=>a-b)
        out.push(item)
      }
    }
    res.json({ from, to, bucketMs, items: out })
  })

  // Forecast endpoint: uses FORECAST_URL if available, otherwise linear forecast fallback
  router.get('/forecast', requireRole('viewer', RBAC_ENFORCE), async (req, res) => {
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
      horizon: z.string().regex(/^\d+$/).optional(),
      step: z.string().regex(/^\d+$/).optional(),
    })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    const { deviceId, metricKey, from, to, horizon, step } = parse.data
    try {
      const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.querySeries
      let data
      if (useTsdb) {
        data = await tsdb.querySeries({ deviceId, metricKey, from: from?Number(from):undefined, to: to?Number(to):undefined })
      } else {
        data = store.querySeries({ deviceId, metricKey, from: from?Number(from):undefined, to: to?Number(to):undefined })
      }
      const series = (data || []).map(p => ({ ts: Number(p.ts), value: Number(p.value) }))
      const H = horizon ? Number(horizon) : 60*60*1000
      const S = step ? Number(step) : (series.length>1 ? (series[series.length-1].ts - series[series.length-2].ts) : 60*1000)
      if (process.env.FORECAST_URL) {
        try {
          const url = new URL('/forecast', process.env.FORECAST_URL)
          const fr = await fetch(url.toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ series, horizonMs: H, stepMs: S }) })
          if (fr.ok) {
            const payload = await fr.json()
            return res.json({ points: payload.points || [] })
          }
        } catch { /* fallthrough */ }
      }
      // Fallback linear forecast
      if (!series || series.length < 2) return res.json({ points: [] })
      const p1 = series[series.length-2], p2 = series[series.length-1]
      const dt = Math.max(1, p2.ts - p1.ts)
      const rate = (p2.value - p1.value) / dt
      const points = []
      for (let t = p2.ts + S; t <= p2.ts + H; t += S) points.push({ ts: t, value: p2.value + rate * (t - p2.ts) })
      return res.json({ points })
    } catch (e) {
      return res.status(500).json({ error: 'forecast failed', details: String(e.message||e) })
    }
  })

  // Export simple KPIs PDF for a device (requires pdfkit installed for 200 OK)
  router.get('/export.pdf', requireRole('analyst', RBAC_ENFORCE), recordAudit('export.pdf'), async (req, res) => {
    const schema = z.object({
      deviceId: z.string().min(1),
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
      title: z.string().optional(),
    })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    if (!pdf || !pdf.hasPdf || !pdf.hasPdf()) return res.status(501).json({ error: 'pdf export not enabled (install pdfkit)' })
    const { deviceId, from, to, title } = parse.data
    let kpis
    const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.queryKpis
    if (useTsdb) {
      try { kpis = await tsdb.queryKpis({ deviceId, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined }) } catch {}
    }
    if (!kpis) kpis = store.getKpis({ deviceId, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined })
    try {
      const buf = await pdf.buildKpiPdf({ title: title || 'IoT KPIs', device: deviceId, kpis, from, to })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename=report_${deviceId}.pdf`)
      res.end(buf)
    } catch (e) {
      res.status(500).json({ error: 'pdf failed', details: String(e.message || e) })
    }
  })

  // Send an email notification (front can call this for client-side alerts)
  router.post("/notify", requireRole('analyst', RBAC_ENFORCE), recordAudit('notify'), async (req, res) => {
    const schema = z.object({
      deviceId: z.string(),
      metricKey: z.string(),
      ts: z.number(),
      value: z.number(),
      level: z.enum(["warn","crit"]).default("warn"),
      message: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: "invalid payload", details: parsed.error.errors })
    if (!mailer) return res.status(501).json({ error: "mailer not configured" })
    try {
      await mailer.sendAlertEmail(parsed.data)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: "send failed", details: String(e.message||e) })
    }
  });

  router.get("/export.csv", requireRole('analyst', RBAC_ENFORCE), recordAudit('export.csv'), (req, res) => {
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: z.string().regex(/^\d+$/).optional(),
      to: z.string().regex(/^\d+$/).optional(),
    });
    const parse = schema.safeParse(req.query);
    if (!parse.success) return res.status(400).json({ error: "invalid params", details: parse.error.errors });
    const { deviceId, metricKey, from, to } = parse.data;
    const points = store.querySeries({
      deviceId,
      metricKey,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=export_${deviceId}_${metricKey}.csv`);
    res.write("timestamp,value\n");
    for (const p of points) {
      res.write(`${p.ts},${p.value}\n`);
    }
    res.end();
  });

  app.use("/api", router);
}

module.exports = { buildApi };
