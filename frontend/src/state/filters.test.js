import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUiStore, PERIODS } from './filters'

function resetStore() {
  const { setState } = useUiStore.getState
    ? useUiStore
    : { setState: useUiStore.setState }
  setState(useUiStore.getInitialState ? useUiStore.getInitialState() : useUiStore.getState())
}

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getState(), true)
  })

  it('expose default period and toggles live/smoothing/highlight', () => {
    const state = useUiStore.getState()
    expect(state.period).toEqual(PERIODS[0])
    state.toggleLive()
    expect(useUiStore.getState().live).toBe(false)
    state.toggleSmoothing()
    expect(useUiStore.getState().smoothing).toBe(true)
    state.toggleHighlight()
    expect(useUiStore.getState().highlightAnomalies).toBe(false)
  })

  it('updates period by key and pagination safely', () => {
    const state = useUiStore.getState()
    state.setPeriodKey('24h')
    expect(useUiStore.getState().period.key).toBe('24h')
    state.setPage(-1)
    expect(useUiStore.getState().page).toBe(1)
    state.setPageSize(2)
    expect(useUiStore.getState().pageSize).toBe(2)
    state.setAggregation('hour')
    expect(useUiStore.getState().aggregation).toBe('hour')
    state.setValueMin(1)
    state.setValueMax(5)
    expect(useUiStore.getState().valueMin).toBe(1)
    expect(useUiStore.getState().valueMax).toBe(5)
    state.setBucketMs(0)
    expect(useUiStore.getState().bucketMs).toBeUndefined()
  })

  it('manages device exclusion list', () => {
    const state = useUiStore.getState()
    state.excludeDevice('a')
    expect(useUiStore.getState().excludedDevices).toContain('a')
    state.toggleExclude('a')
    expect(useUiStore.getState().excludedDevices).not.toContain('a')
    state.includeDevice('a')
    expect(useUiStore.getState().excludedDevices).not.toContain('a')
  })
})
