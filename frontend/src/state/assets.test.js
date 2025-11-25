import { describe, it, expect } from 'vitest'
import { useAssets } from './assets'

describe('useAssets store', () => {
  it('sets and merges metadata per device', () => {
    useAssets.setState((s) => ({ ...s, meta: {} }))
    const { setMeta } = useAssets.getState()
    setMeta('d1', { name: 'Device 1', room: 'A' })
    setMeta('d1', { room: 'B', tags: ['x'] })
    const meta = useAssets.getState().meta
    expect(meta.d1.name).toBe('Device 1')
    expect(meta.d1.room).toBe('B')
    expect(meta.d1.tags).toEqual(['x'])
  })

  it('replaces all metadata and resets to empty', () => {
    useAssets.setState((s) => ({ ...s, meta: { d1: { name: 'Old' } } }))
    const { setAll, reset } = useAssets.getState()
    setAll({ d2: { name: 'New' } })
    expect(useAssets.getState().meta.d2.name).toBe('New')
    reset()
    expect(useAssets.getState().meta).toEqual({})
  })
})
