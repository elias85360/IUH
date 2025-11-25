import { describe, it, expect } from 'vitest'
import { computeStats, rollingZscore, toCsv, download } from './stats'

describe('stats helpers', () => {
  it('handles empty points gracefully', () => {
    const res = computeStats([])
    expect(res).toEqual({ count: 0, min: null, max: null, avg: null, last: null })
  })

  it('computes aggregates safely', () => {
    const points = [{ value: 1 }, { value: 'oops' }, { value: 3 }]
    const res = computeStats(points)
    expect(res.count).toBe(3)
    expect(res.min).toBe(1)
    expect(res.max).toBe(3)
    expect(res.avg).toBeCloseTo(4 / 3)
    expect(res.last).toBe(3)
  })

  it('produces rolling z-scores with bounded window', () => {
    const pts = [
      { ts: 1, value: 1 },
      { ts: 2, value: 2 },
      { ts: 3, value: 3 },
      { ts: 4, value: 4 },
    ]
    const out = rollingZscore(pts, 2)
    expect(out).toHaveLength(4)
    expect(out[0].z).toBe(0)
    expect(out[1].z).toBeCloseTo(1)
    expect(out[3].z).toBeCloseTo(1)
  })

  it('serializes points to CSV', () => {
    const pts = [{ ts: 1, value: 10 }, { ts: 2, value: 20 }]
    expect(toCsv(pts)).toBe('timestamp,value\n1,10\n2,20')
  })

  it('triggers download with browser stubs', () => {
    global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts } }
    const clicks = []
    const link = {
      click: () => clicks.push('clicked'),
      set href(v) { this._href = v },
      set download(v) { this._download = v },
    }
    global.URL = { createObjectURL: () => 'blob:url', revokeObjectURL: () => {} }
    global.document = {
      createElement: () => link,
      body: { appendChild: () => {}, removeChild: () => {} },
    }
    download('file.csv', 'content')
    expect(link._href).toBe('blob:url')
    expect(link._download).toBe('file.csv')
    expect(clicks).toEqual(['clicked'])
  })
})
