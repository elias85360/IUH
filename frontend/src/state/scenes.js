import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Scenes: named presets (period, room, group, layout)
export const useScenes = create(persist((set, get) => ({
  items: [],
  add(scene) {
    const s = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ...scene }
    set((st)=>({ items: [...st.items, s] }))
  },
  remove(id) { set((st)=>({ items: st.items.filter(x=>x.id!==id) })) },
}), { name: 'scenes-store' }))

 