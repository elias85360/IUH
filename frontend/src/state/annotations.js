import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Annotations per device: { [deviceId]: [{ id, ts, label }] }
export const useAnnotations = create(persist((set, get) => ({
  byDevice: {},
  add(deviceId, ann) {
    const map = { ...(get().byDevice || {}) }
    const arr = map[deviceId] ? map[deviceId].slice() : []
    arr.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ...ann })
    map[deviceId] = arr
    set({ byDevice: map })
  },
  remove(deviceId, id) {
    const map = { ...(get().byDevice || {}) }
    map[deviceId] = (map[deviceId]||[]).filter(a => a.id !== id)
    set({ byDevice: map })
  },
}), { name: 'annotations-store' }))