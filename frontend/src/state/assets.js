import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAssets = create(persist((set, get) => ({
  meta: {}, // deviceId -> { name?, room?, tags?: [] }
  setMeta(deviceId, patch) {
    set((s)=>({ meta: { ...s.meta, [deviceId]: { ...(s.meta[deviceId]||{}), ...patch } } }))
  },
}), { name: 'assets-meta' }))

 