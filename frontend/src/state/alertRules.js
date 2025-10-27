import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Simple alert rule engine (client-side)
// Rule: { id, name, deviceId: 'any' | <id>, metric: 'P', op: '>' | '<' | '>=' | '<=', threshold: number, durationMs?: number, enabled: true, recipients?: string }

export const useAlertRules = create(persist((set, get) => ({
  rules: [],
  add(rule) { set((s)=>({ rules: [...s.rules, { id: crypto.randomUUID(), enabled: true, ...rule }] })) },
  update(id, patch) { set((s)=>({ rules: s.rules.map(r=> r.id===id ? { ...r, ...patch } : r) })) },
  remove(id) { set((s)=>({ rules: s.rules.filter(r=> r.id!==id) })) },
}), { name: 'alert-rules' }))

export function evalRule(rule, latestValue) {
  if (latestValue == null) return false
  switch (rule.op) {
    case '>': return latestValue > rule.threshold
    case '<': return latestValue < rule.threshold
    case '>=': return latestValue >= rule.threshold
    case '<=': return latestValue <= rule.threshold
    default: return false
  }
} 

