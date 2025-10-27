import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Alerts store keeps a persistent log and a short-lived toast list.
export const useAlerts = create(persist((set, get) => ({
  log: [],        // all alerts (trimmed to last 200)
  toasts: [],     // ephemeral toasts for UI
  push(a) {
    const entry = { ...a, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` }
    const log = [entry, ...(get().log||[])].slice(0, 200)
    const toasts = [entry, ...(get().toasts||[])].slice(0, 5)
    set({ log, toasts })
    setTimeout(()=>{
      set((s)=>({ toasts: (s.toasts||[]).filter(x => x.id !== entry.id) }))
    }, 6000)
  },
  clear() { set({ log: [] }) },
}), { name: 'alerts-log' }))
 