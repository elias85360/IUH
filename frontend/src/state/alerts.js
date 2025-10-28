import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Alerts store keeps a persistent log, audit trail and UI routing toggles.
function toArray(v) {
  if (Array.isArray(v)) return v.slice()
  try { return v && typeof v[Symbol.iterator] === 'function' ? Array.from(v) : [] } catch { return [] }
}

export const useAlerts = create(persist((set, get) => ({
  log: [],            // recent alerts (trimmed)
  toasts: [],         // ephemeral toasts for UI
  acked: [],          // ids acked (stored as array for persist stability)
  ackMeta: {},        // id -> { ts, user }
  silenced: {},       // key `${deviceId}::${metricKey}` -> untilTs
  audit: [],          // [{ action:'ack'|'silence'|'clear'|'closeGroup', id?, deviceId?, metricKey?, user, ts }]
  routeSlack: false,  // UI toggle for Slack routing (no-op if backend not wired)
  routeWebhook: false,// UI toggle for Webhook routing
  webhookUrl: '',     // Optional URL (UI only)
  slackChannel: '',   // Optional channel (UI only)

  push(a) {
    const entry = { ...a, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` }
    const key = `${entry.deviceId}::${entry.metricKey}`
    const until = get().silenced?.[key] || 0
    const nextLog = [entry, ...(get().log||[])].slice(0, 200)
    if (until && Date.now() < until) { set({ log: nextLog }); return }
    const toastsNext = [entry, ...(get().toasts||[])].slice(0, 5)
    set({ log: nextLog, toasts: toastsNext })
    setTimeout(()=>{ set((s)=>({ toasts: (s.toasts||[]).filter(x => x.id !== entry.id) })) }, 6000)
  },
  clear(user) {
    const ts = Date.now()
    set((s)=>({ log: [], audit: [{ action:'clear', user, ts }, ...(s.audit||[])].slice(0,500) }))
  },
  ack(id, user) {
    const ts = Date.now()
    set((s)=>{
      const prev = toArray(s.acked)
      if (!prev.includes(id)) prev.push(id)
      const ackMeta = { ...(s.ackMeta||{}), [id]: { ts, user } }
      const audit = [{ action:'ack', id, user, ts }, ...(s.audit||[])].slice(0,500)
      return { acked: prev, ackMeta, audit }
    })
  },
  closeGroup(deviceId, metricKey, user) {
    const ts = Date.now()
    set((s)=>{
      const ids = (s.log||[]).filter(a => a.deviceId===deviceId && a.metricKey===metricKey).map(a => a.id)
      const prev = new Set(toArray(s.acked))
      for (const id of ids) prev.add(id)
      const ackMeta = { ...(s.ackMeta||{}) }
      for (const id of ids) ackMeta[id] = { ts, user }
      const audit = [{ action:'closeGroup', deviceId, metricKey, user, ts, count: ids.length }, ...(s.audit||[])].slice(0,500)
      return { acked: Array.from(prev), ackMeta, audit }
    })
  },
  silence(deviceId, metricKey, ms=3600000, user) {
    const key = `${deviceId}::${metricKey}`
    const ts = Date.now()
    set((s)=>({ 
      silenced: { ...(s.silenced||{}), [key]: ts + Math.max(0, ms) },
      audit: [{ action:'silence', deviceId, metricKey, user, ts, durationMs: ms }, ...(s.audit||[])].slice(0,500)
    }))
  },
  setRouting(opts) { set((s)=>({ ...s, ...opts })) },
}), { name: 'alerts-log' }))
 
