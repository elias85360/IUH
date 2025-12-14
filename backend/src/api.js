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
  router.get("/healthz", (req, res) => {
    res.json({ ok: true, diagnostics: store.diagnostics() });
  });

  router.get("/ready", (req, res) => {
    const components = {}
    components.api = 'ok'
    components.datastore = store ? 'ok' : 'fail'
    const tsdbNeeded = store && store.enableTsdb
    components.tsdb = tsdbNeeded ? (tsdb ? 'ok' : 'degraded') : 'na'
    const wantsRedis = !!process.env.REDIS_URL
    components.redis = wantsRedis ? (process.env.REDIS_URL ? 'unknown' : 'degraded') : 'na'
    const ok = Object.values(components).every((v) => v === 'ok' || v === 'na')
    res.status(ok ? 200 : 503).json({ ok, components })
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
      options: z.object({
        zScore: z.number().optional(),
        emailNotify: z.boolean().optional(),
        deadbandPct: z.number().optional(),
        adaptiveWarnPct: z.number().optional(),
        adaptiveCritPct: z.number().optional(),
        adaptiveMethod: z.enum(['mean', 'median']).optional(),
      }).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.errors })
    const next = setSettings(parsed.data, false)
    res.json({ ok: true, settings: next })
  })
  router.get('/thresholds/effective', requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
      method: z.enum(['mean', 'median']).optional(),
      adaptive: z.enum(['0', '1']).optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid params', details: parsed.error.errors })
    const { deviceId, from, to, method, adaptive } = parsed.data
    const meta = getAssetsMeta()[deviceId] || {}
    const effStatic = effectiveFor({ deviceId, deviceMeta: meta }) || {}
    const adaptiveMode = adaptive === '1'
    if (!adaptiveMode) return res.json({ deviceId, thresholds: effStatic })
    const settings = getSettings()
    const warnPct = Number(settings?.options?.adaptiveWarnPct ?? 5)
    const critPct = Number(settings?.options?.adaptiveCritPct ?? 10)
    const strategy = method || settings?.options?.adaptiveMethod || 'mean'
    const metrics = store.getMetrics(deviceId) || []
    const now = Date.now()
    const fromTs = from != null ? from : now - (60 * 60 * 1000)
    const toTs = to != null ? to : now
    const calcBase = (series) => {
      const vals = (series || []).map(p => Number(p.value)).filter((v) => Number.isFinite(v))
      if (!vals.length) return null
      if (strategy === 'median') {
        const sorted = vals.slice().sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      }
      const sum = vals.reduce((a, v) => a + v, 0)
      return sum / vals.length
    }
    const thresholds = {}
    for (const m of metrics) {
      const dir = (effStatic[m.key]?.direction) || (m.key === 'pf' ? 'below' : 'above')
      const series = store.querySeries({ deviceId, metricKey: m.key, from: fromTs, to: toTs })
      const base = calcBase(series)
      if (base == null) {
        thresholds[m.key] = { ...(effStatic[m.key] || {}), direction: dir }
        continue
      }
      const warn = dir === 'above' ? base * (1 + warnPct / 100) : base * (1 - warnPct / 100)
      const crit = dir === 'above' ? base * (1 + critPct / 100) : base * (1 - critPct / 100)
      thresholds[m.key] = {
        ...(effStatic[m.key] || {}),
        direction: dir,
        warn,
        crit,
        adaptive: true,
        base,
        method: strategy,
        warnPct,
        critPct,
      }
    }
    res.json({ deviceId, from: fromTs, to: toTs, thresholds })
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
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
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
      try { kpis = await tsdb.queryKpis({ deviceId, from, to }) } catch {}
    }
    if (!kpis) kpis = store.getKpis({ deviceId, from, to });
    const payload = { deviceId, kpis }
    const tag = weakEtag(payload); if (tag) res.setHeader('ETag', tag)
    res.setHeader('Cache-Control', 'private, max-age=5')
    await cacheSet(key, payload, 5)
    res.json(payload);
  }));
  router.get("/timeseries", requireRole('viewer', RBAC_ENFORCE), async (req, res) => withSpan('api.timeseries', async () => {
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
      limit: num.max(10000).optional(),
      bucketMs: num.min(1000, { message: 'bucketMs must be >= 1000' }).optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
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
        data = await tsdb.querySeries({ deviceId, metricKey, from, to, bucketMs })
      } catch {}
    }
    if (!data) {
      data = store.querySeries({ deviceId, metricKey, from, to, limit, bucketMs });
    }
    // Server-side downsampling (stride) to cap points for UI
    const MAX_POINTS = Math.max(100, Number(process.env.MAX_API_POINTS || 2000))
    if (Array.isArray(data) && data.length > MAX_POINTS) {
      const stride = Math.ceil(data.length / MAX_POINTS)
      const ds = []
      for (let i = 0; i < data.length; i += stride) ds.push(data[i])
      if (ds[ds.length - 1]?.ts !== data[data.length - 1].ts) ds.push(data[data.length - 1])
      data = ds
    }
    const payload = { deviceId, metricKey, points: data }
    const tag = weakEtag(payload); if (tag) res.setHeader('ETag', tag)
    res.setHeader('Cache-Control', 'private, max-age=5')
    await cacheSet(key, payload, 5)
    try { require('./metrics').recordPointsReturned('/api/timeseries', Array.isArray(data) ? data.length : 0) } catch {}
    res.json(payload);
  }));
  router.get("/diagnostics", requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    res.json(store.diagnostics());
  });
  // Data quality and health summary per device/metric
  router.get('/quality', requireRole('viewer', RBAC_ENFORCE), (req, res) => {
    const num = z.coerce.number().int()
    const schema = z.object({
      from: num.optional(),
      to: num.optional(),
      bucketMs: num.min(1000, { message: 'bucketMs must be >= 1000' }).optional(),
      detail: z.string().regex(/^[01]$/).optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    const now = Date.now()
    const from = parse.data.from != null ? parse.data.from : (now - 24*60*60*1000)
    const to = parse.data.to != null ? parse.data.to : now
    const bucketMs = parse.data.bucketMs != null ? parse.data.bucketMs : 60*60*1000
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
    try { require('./metrics').updateDataQualityFromItems(out) } catch {}
    res.json({ from, to, bucketMs, items: out })
  })

  // ------- Admin: status and diagnostics -------
  router.get('/admin/status', requireRole('admin', RBAC_ENFORCE), (_req, res) => {
    const mask = (s) => (s ? (String(s).slice(0, 6) + '…') : '')
    const env = process.env
    res.json({
      RBAC_ENFORCE: env.RBAC_ENFORCE === '1',
      ALLOW_API_KEY_WITH_RBAC: env.ALLOW_API_KEY_WITH_RBAC === '1',
      API_KEY_PRESENT: !!env.API_KEY,
      API_HMAC_ENFORCE: env.API_HMAC_ENFORCE === '1',
      API_HMAC_KEY_ID: env.API_HMAC_KEY_ID || null,
      TSDB_READ: env.TSDB_READ === '1',
      TSDB_MIRROR: env.TSDB_MIRROR === '1',
      FORECAST_URL: !!env.FORECAST_URL,
      DATA_SOURCE: env.DATA_SOURCE || 'mock',
      ROUTE_SLACK: env.ROUTE_SLACK === '1',
      ROUTE_WEBHOOK: env.ROUTE_WEBHOOK === '1',
      SLACK_WEBHOOK_URL: mask(env.SLACK_WEBHOOK_URL),
      WEBHOOK_URL: mask(env.WEBHOOK_URL),
      SMTP_CONFIGURED: !!(env.SMTP_HOST && env.SMTP_PORT && env.ALERTS_FROM && env.ALERTS_TO),
    })
  })

  // Require API key only (no RBAC) for ping to validate keys
  router.get('/admin/ping', apiKeyMiddleware(!!process.env.API_KEY), (_req, res) => {
    res.json({ ok: true })
  })

  // HMAC verification test (requires admin + valid HMAC if present)
  router.post('/admin/hmac-test', hmacMiddleware(true), requireRole('admin', RBAC_ENFORCE), (_req, res) => {
    res.json({ ok: true })
  })

  // ------- Alerts routing (Slack/Webhook) -------
  router.get('/alerts/routing', requireRole('admin', RBAC_ENFORCE), (req, res) => {
    try {
      const routers = req.app.get('alertRouters')
      if (!routers || !routers.get) return res.json({ routeSlack:false, routeWebhook:false })
      res.json(routers.get())
    } catch { res.json({ routeSlack:false, routeWebhook:false }) }
  })
  router.put('/alerts/routing', requireRole('admin', RBAC_ENFORCE), recordAudit('alerts.routing.update'), (req, res) => {
    try {
      const allowed = ['routeSlack','routeWebhook','slackWebhookUrl','slackChannel','webhookUrl']
      const patch = {}
      for (const k of allowed) if (k in (req.body||{})) patch[k] = req.body[k]
      const routers = req.app.get('alertRouters')
      if (!routers || !routers.update) return res.status(501).json({ error:'routing not available' })
      const next = routers.update(patch)
      res.json({ ok:true, routing: next })
    } catch { res.status(500).json({ error:'update failed' }) }
  })
  router.post('/alerts/test', requireRole('admin', RBAC_ENFORCE), recordAudit('alerts.test'), async (req, res) => {
    try {
      const routers = req.app.get('alertRouters')
      if (!routers || !routers.sendAlert) return res.status(501).json({ error:'routing not available' })
      const now = Date.now()
      const payload = { deviceId: req.body?.deviceId || 'test-device', metricKey: req.body?.metricKey || 'P', ts: now, value: Number(req.body?.value || 1), level: req.body?.level || 'warn' }
      await routers.sendAlert(payload)
      res.json({ ok:true })
    } catch (e) { res.status(500).json({ error:'send failed' }) }
  })

  // Test SMTP (sends a simple message to ALERTS_TO)
  router.post('/test/smtp', requireRole('admin', RBAC_ENFORCE), async (req, res) => {
    try {
      if (!mailer) return res.status(501).json({ error: 'mailer not configured' })
      const to = String(process.env.ALERTS_TO || '').split(',').map(s=>s.trim()).filter(Boolean)[0]
      if (!to) return res.status(400).json({ error: 'ALERTS_TO not set' })
      await mailer.sendAlertEmail({ deviceId: 'test', metricKey: 'test', ts: Date.now(), value: 0, level: 'warn', message: 'SMTP test message' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: 'send failed', details: String(e.message||e) }) }
  })

  // Forecast endpoint: uses FORECAST_URL if available, otherwise linear forecast fallback
  router.get('/forecast', requireRole('viewer', RBAC_ENFORCE), async (req, res) => {
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
      horizon: num.optional(),
      step: num.min(1000, { message: 'step must be >= 1000' }).optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    const { deviceId, metricKey, from, to, horizon, step } = parse.data
    try {
      const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.querySeries
      let data
      if (useTsdb) {
        data = await tsdb.querySeries({ deviceId, metricKey, from, to })
      } else {
        data = store.querySeries({ deviceId, metricKey, from, to })
      }
      const series = (data || []).map(p => ({ ts: Number(p.ts), value: Number(p.value) }))
      const H = horizon ? horizon : 60*60*1000
      const S = step ? step : (series.length>1 ? (series[series.length-1].ts - series[series.length-2].ts) : 60*1000)
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
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
      title: z.string().optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
    const parse = schema.safeParse(req.query)
    if (!parse.success) return res.status(400).json({ error: 'invalid params', details: parse.error.errors })
    if (!pdf || !pdf.hasPdf || !pdf.hasPdf()) return res.status(501).json({ error: 'pdf export not enabled (install pdfkit)' })
    const { deviceId, from, to, title } = parse.data
    let kpis
    const useTsdb = String(process.env.TSDB_READ || '').toLowerCase() === '1' && tsdb && tsdb.queryKpis
    if (useTsdb) {
      try { kpis = await tsdb.queryKpis({ deviceId, from, to }) } catch {}
    }
    if (!kpis) kpis = store.getKpis({ deviceId, from, to })
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
    if (!parsed.data.level !== 'crit') return res.status(204).end()
    if (!mailer) return res.status(501).json({ error: "mailer not configured" })
    try {
      await mailer.sendAlertEmail(parsed.data)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: "send failed", details: String(e.message||e) })
    }
  });

  router.get("/export.csv", requireRole('analyst', RBAC_ENFORCE), recordAudit('export.csv'), (req, res) => {
    const num = z.coerce.number().int()
    const schema = z.object({
      deviceId: z.string().min(1),
      metricKey: z.string().min(1),
      from: num.optional(),
      to: num.optional(),
    }).refine((v) => (v.from == null || v.to == null || v.from <= v.to), { path: ['from'], message: 'from must be <= to' })
    const parse = schema.safeParse(req.query);
    if (!parse.success) return res.status(400).json({ error: "invalid params", details: parse.error.errors });
    const { deviceId, metricKey, from, to } = parse.data;
    const points = store.querySeries({
      deviceId,
      metricKey,
      from,
      to,
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
