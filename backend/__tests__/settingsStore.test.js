jest.mock('../src/persist', () => {
  let store = {}
  return {
    loadJSON: jest.fn((_file, def) => store['thresholds.json'] ?? def),
    saveJSON: jest.fn((_file, obj) => { store['thresholds.json'] = obj; return true }),
    __reset: () => { store = {} },
  }
})

const persist = require('../src/persist')

function freshStore() {
  jest.resetModules()
  return require('../src/settingsStore')
}

describe('settingsStore', () => {
  beforeEach(() => { persist.__reset() })

  test('effective thresholds merge global/group/room/device', () => {
    const store = freshStore()
    store.setSettings({
      groups: { g1: { P: { warn: 10 } } },
      rooms: { r1: { P: { crit: 20 } } },
      devices: { d1: { P: { warn: 5 } } },
    })
    const eff = store.effectiveFor({ deviceId: 'd1', deviceMeta: { group: 'g1', room: 'r1' } })
    expect(eff.P.warn).toBe(5) // device override
    expect(eff.P.crit).toBe(20) // room override
    expect(eff.P.direction).toBe('above')
  })

  test('setSettings supports replace and device removal', () => {
    const store = freshStore()
    store.setSettings({ devices: { d2: { P: { warn: 1 } } } })
    expect(store.getSettings().devices.d2.P.warn).toBe(1)
    store.setSettings({ devices: { d2: null } })
    expect(store.getSettings().devices.d2).toBeUndefined()
    const replaced = store.setSettings({ global: { P: { warn: 99 } } }, true)
    expect(replaced.global.P.warn).toBe(99)
  })

  test('options merge keeps previous values', () => {
    const store = freshStore()
    store.setSettings({ options: { deadbandPct: 7 } })
    const s = store.getSettings()
    expect(s.options.deadbandPct).toBe(7)
    expect(s.options.emailNotify).toBe(true)
  })
})
