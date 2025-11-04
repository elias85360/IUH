import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function toArray(v) {
  if (Array.isArray(v)) return v.slice()
  try { return v && typeof v[Symbol.iterator] === 'function' ? Array.from(v) : [] } catch { return [] }
}

export const useAlerts = create(persist((set, get) => ({
  log: [],            // recent alerts (trimmed)
  acked: [],          // ids acked (stored as array for persist stability)
  silenced: {},       // key `${deviceId}::${metricKey}` -> untilTs
  audit: [],          // [{ action:'ack'|'silence'|'clear', ... }]

  push(a) {
    const entry = { ...a, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` }
    const key = `${entry.deviceId}::${entry.metricKey}`
    const until = get().silenced?.[key] || 0
    const nextLog = [entry, ...(get().log||[])].slice(0, 200)
    if (until && Date.now() < until) { set({ log: nextLog }); return }
    set({ log: nextLog })
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
      const audit = [{ action:'ack', id, user, ts }, ...(s.audit||[])].slice(0,500)
      return { acked: prev, audit }
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
}), { name: 'alerts-log' }))
 
