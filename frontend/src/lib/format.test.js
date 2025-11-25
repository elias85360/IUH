import { describe, it, expect } from 'vitest'
import { unitForMetric, toDisplay, formatValue, yDomainFor, targetPointsForSpan, yTickFormatterFor, timeTickFormatter, bucketForSpan } from './format'

describe('format helpers', () => {
  it('maps metrics to units and converts raw values', () => {
    expect(unitForMetric('P')).toBe('kW')
    expect(unitForMetric('E')).toBe('kWh')
    expect(unitForMetric('U')).toBe('V')
    expect(unitForMetric('humid')).toBe('%')
    expect(toDisplay('P', 1200)).toBeCloseTo(1.2)
    expect(toDisplay('E', 2500)).toBeCloseTo(2.5)
  })

  it('formats values with rounding and unit suffix', () => {
    expect(formatValue('P', 1500)).toBe('1.5 kW')
    expect(formatValue('humid', 52.4)).toBe('52 %')
    expect(formatValue('pf', 0.9876)).toBe('0.99')
    expect(formatValue('temp', 21.23)).toContain('21.2')
    expect(formatValue('pf', 'oops')).toBe('')
  })

  it('builds sensible y domains per metric', () => {
    const voltage = yDomainFor('U', [{ value: 230 }])
    expect(voltage[0]).toBeLessThanOrEqual(210)
    expect(voltage[1]).toBeGreaterThanOrEqual(230)
    const humidity = yDomainFor('humid', [{ value: 30 }, { value: 90 }])
    expect(humidity).toEqual([0, 100])
    const power = yDomainFor('P', [{ value: 0 }, { value: 2000 }])
    expect(power[0]).toBeLessThanOrEqual(0)
    expect(yDomainFor('unknown', null)).toEqual(['auto', 'auto'])
  })

  it('targets bucket counts by span', () => {
    const day = 24 * 60 * 60 * 1000
    expect(targetPointsForSpan(day)).toBe(240)
    expect(targetPointsForSpan(10 * day)).toBe(720)
    expect(targetPointsForSpan(40 * day)).toBe(1200)
  })

  it('builds tick formatters for various metrics', () => {
    const pfTick = yTickFormatterFor('pf')
    expect(pfTick(0.8123)).toBe('0.81')
    const tempTick = yTickFormatterFor('temp')
    expect(tempTick(21.17)).toBe('21.2')
    const humidTick = yTickFormatterFor('humid')
    expect(humidTick(44.7)).toBe('45')
    const defaultTick = yTickFormatterFor('other')
    expect(defaultTick('abc')).toBe('')
  })

  it('formats time ticks based on span', () => {
    const day = 24 * 60 * 60 * 1000
    const short = timeTickFormatter(Date.now(), Date.now() + day)
    expect(short(Date.now())).toMatch(/\d{2}/)
    const mid = timeTickFormatter(Date.now(), Date.now() + 10 * day)
    expect(mid(Date.now())).toMatch(/\d{2}/)
    const long = timeTickFormatter(Date.now(), Date.now() + 40 * day)
    expect(long(Date.now())).toMatch(/\d{2}/)
    const bad = timeTickFormatter(0, 0)
    expect(bad('not-a-date')).toMatch(/Invalid|NaN/)
  })

  it('computes bucket size for span', () => {
    const day = 24 * 60 * 60 * 1000
    expect(bucketForSpan(day)).toBe(6 * 60 * 1000) // ~6 minutes for 240 buckets
    expect(bucketForSpan(3 * day, 5 * 60 * 1000)).toBeGreaterThan(0)
    expect(bucketForSpan(0)).toBe(60 * 1000)
    expect(bucketForSpan(2 * 60 * 60 * 1000, 2 * 60 * 1000)).toBeGreaterThanOrEqual(2 * 60 * 1000)
  })
  it('handles edge cases in bucket size computation', () => {
    expect(bucketForSpan(-1000)).toBe(60 * 1000) // negative span defaults to 1 minute
    expect(bucketForSpan(0, -5000)).toBe(0) // negative min bucket coerces to raw calculation
  })
  it('handles edge cases in y domain computation', () => {
    expect(yDomainFor('P', [])).toEqual(['auto', 'auto']) // empty data
    expect(yDomainFor('humid', [{ value: -10 }, { value: 150 }])).toEqual([0, 100]) // out of bounds humidity
  })
  it('handles edge cases in value formatting', () => {
    expect(formatValue('P', null)).toBe('0.0 kW') // null treated as 0
    expect(formatValue('temp', 'not-a-number')).toBe('') // invalid number
  })
})
