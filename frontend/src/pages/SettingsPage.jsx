import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../state/settings.js'
import { useUiStore } from '../state/filters.js'
import { api } from '../services/api.js'

const METRICS = ['U', 'I', 'P', 'E', 'F', 'pf', 'temp', 'humid']
const PERIOD_OPTIONS = [
  { key: '1h', label: '1 h' },
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '6mo', label: '6 months' },
  { key: '1y', label: '1 year' },
]

export default function SettingsPage() {
  const { options, setOptions, getThreshold, setThreshold } = useSettings()
  const { period, setPeriodKey, refreshNow, devices } = useUiStore()
  const [defaults, setDefaults] = useState({})
  const [deadbandPct, setDeadbandPct] = useState('')
  const [adaptiveWarnPct, setAdaptiveWarnPct] = useState('5')
  const [adaptiveCritPct, setAdaptiveCritPct] = useState('10')
  const [adaptiveMethod, setAdaptiveMethod] = useState('mean')
  const [kpis, setKpis] = useState({})

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getThresholds()
        setDefaults(s.global || {})
        setDeadbandPct(String(s?.options?.deadbandPct ?? ''))
        setAdaptiveWarnPct(String(s?.options?.adaptiveWarnPct ?? '5'))
        setAdaptiveCritPct(String(s?.options?.adaptiveCritPct ?? '10'))
        setAdaptiveMethod(s?.options?.adaptiveMethod || 'mean')
      } catch {}
    })()
  }, [])

  useEffect(() => {
    (async () => {
      const out = {}
      for (const d of devices) {
        try {
          const r = await api.kpis(d.id)
          out[d.id] = r.kpis || {}
        } catch {}
      }
      setKpis(out)
    })()
  }, [devices])

  const periodValue = useMemo(() => period?.key || '24h', [period?.key])

  return (
    <div className="panel">
      <div className="panel-title">Settings</div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Global chart defaults</div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>
            Default bucket (ms)
            <input
              className="input"
              style={{ width: 120 }}
              type="number"
              value={options.bucketMs ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setOptions({ bucketMs: v ? Number(v) : undefined })
              }}
              placeholder="auto"
              min={1000}
            />
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={!!options.smoothing}
              onChange={(e) => setOptions({ smoothing: e.target.checked })}
            />
            Smoothing (moving average)
          </label>
          <label className="row" style={{ gap: 6 }}>
            Mode
            <select
              className="select"
              value={options.smoothingMode || 'SMA'}
              onChange={(e) => setOptions({ smoothingMode: e.target.value })}
            >
              <option value="SMA">SMA</option>
              <option value="EMA">EMA</option>
            </select>
          </label>
          <label className="row" style={{ gap: 6 }}>
            Window
            <input
              className="input"
              style={{ width: 80 }}
              type="number"
              min={1}
              value={options.smoothingWindow || 5}
              onChange={(e) =>
                setOptions({ smoothingWindow: Number(e.target.value || 5) })
              }
            />
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={!!options.showBaseline}
              onChange={(e) => setOptions({ showBaseline: e.target.checked })}
            />
            Show baseline
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={!!options.showForecast}
              onChange={(e) => setOptions({ showForecast: e.target.checked })}
            />
            Show forecast
          </label>
          <label className="row" style={{ gap: 6 }}>
            Y scale
            <select
              className="select"
              value={options.yScale || 'linear'}
              onChange={(e) => setOptions({ yScale: e.target.value })}
            >
              <option value="linear">linear</option>
              <option value="log">log</option>
            </select>
          </label>
          <label className="row" style={{ gap: 6 }}>
            Theme
            <select
              className="select"
              value={options.theme || 'light'}
              onChange={(e) => setOptions({ theme: e.target.value })}
            >
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </select>
          </label>
          <label className="row" style={{ gap: 6 }}>
            Language
            <select
              className="select"
              value={options.lang || 'fr'}
              onChange={(e) => setOptions({ lang: e.target.value })}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>
            Default period
            <select
              className="select"
              value={periodValue}
              onChange={(e) => setPeriodKey(e.target.value)}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={refreshNow}>
            ↻ Re-anchor time
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Default thresholds</div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="row" style={{ gap: 6 }}>
            Deadband (%)
            <input
              className="input"
              style={{ width: 80 }}
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={deadbandPct}
              onChange={(e) => setDeadbandPct(e.target.value)}
              placeholder="5"
            />
          </label>
          <button
            className="btn"
            onClick={async () => {
              try {
                const v = Number(deadbandPct)
                if (!Number.isFinite(v) || v < 0) {
                  alert('Invalid value')
                  return
                }
                await api.putThresholds({ options: { deadbandPct: v } })
                setOptions({ deadbandPct: v })
                alert('Deadband updated')
              } catch {
                alert('Update failed')
              }
            }}
            >
              Save deadband
            </button>
          <label className="row" style={{ gap: 6 }}>
            Warn delta (%)
            <input
              className="input"
              style={{ width: 80 }}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={adaptiveWarnPct}
              onChange={(e) => setAdaptiveWarnPct(e.target.value)}
            />
          </label>
          <label className="row" style={{ gap: 6 }}>
            Crit delta (%)
            <input
              className="input"
              style={{ width: 80 }}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={adaptiveCritPct}
              onChange={(e) => setAdaptiveCritPct(e.target.value)}
            />
          </label>
          <label className="row" style={{ gap: 6 }}>
            Base
            <select
              className="select"
              value={adaptiveMethod}
              onChange={(e)=>setAdaptiveMethod(e.target.value)}
            >
              <option value="mean">Moyenne</option>
              <option value="median">Médiane</option>
            </select>
          </label>
          <button
            className="btn"
            onClick={async () => {
              try {
                const warn = Number(adaptiveWarnPct)
                const crit = Number(adaptiveCritPct)
                if (!Number.isFinite(warn) || !Number.isFinite(crit) || warn < 0 || crit < 0) {
                  alert('Invalid values')
                  return
                }
                await api.putThresholds({ options: { adaptiveWarnPct: warn, adaptiveCritPct: crit, adaptiveMethod } })
                setOptions({ adaptiveWarnPct: warn, adaptiveCritPct: crit, adaptiveMethod })
              alert('Updated Thresholds')
              } catch {
                alert('Update failed')
              }
            }}
          >
            Save adaptifs
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th>Metric</th>
                <th>Direction</th>
                <th>Warn</th>
                <th>Crit</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td>{m}</td>
                  <td>
                    <select
                      className="select"
                      value={defaults[m]?.direction || (m === 'pf' ? 'below' : 'above')}
                      onChange={(e) =>
                        setDefaults((prev) => ({
                          ...prev,
                          [m]: { ...(prev[m] || {}), direction: e.target.value },
                        }))
                      }
                    >
                      <option value="above">above</option>
                      <option value="below">below</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number"
                      value={defaults[m]?.warn ?? ''}
                      onChange={(e) =>
                        setDefaults((prev) => ({
                          ...prev,
                          [m]: {
                            ...(prev[m] || {}),
                            warn: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number"
                      value={defaults[m]?.crit ?? ''}
                      onChange={(e) =>
                        setDefaults((prev) => ({
                          ...prev,
                          [m]: {
                            ...(prev[m] || {}),
                            crit: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button
            className="btn"
            onClick={async () => {
              try {
                await api.putThresholds({ global: defaults })
                alert('Defaults saved')
              } catch {
                alert('Save failed')
              }
            }}
          >
            Save defaults
          </button>
          <button
            className="btn"
            onClick={async () => {
              try {
                const s = await api.getThresholds()
                setDefaults(s.global || {})
              } catch {}
            }}
          >
            Reload
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Thresholds per device</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th>Device</th>
                {METRICS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td>{d.name}</td>
                  {METRICS.map((m) => {
                    const th = getThreshold(d.id, m)
                    const last = kpis[d.id]?.[m]?.last
                    const dir = th?.direction || (m === 'pf' ? 'below' : 'above')
                    const levelClass = (() => {
                      if (last == null) return ''
                      if (dir === 'below') {
                        if (th?.crit != null && last <= th.crit) return 'crit'
                        if (th?.warn != null && last <= th.warn) return 'warn'
                        return 'ok'
                      }
                      if (th?.crit != null && last >= th.crit) return 'crit'
                      if (th?.warn != null && last >= th.warn) return 'warn'
                      return 'ok'
                    })()
                    return (
                      <td key={`${d.id}-${m}`}>
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <span className={`status-chip ${levelClass}`}></span>
                          <input
                            className="input"
                            style={{ width: 70 }}
                            type="number"
                            value={th?.warn ?? ''}
                            placeholder="warn"
                            onChange={(e) =>
                              setThreshold(d.id, m, {
                                warn: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                          <input
                            className="input"
                            style={{ width: 70 }}
                            type="number"
                            value={th?.crit ?? ''}
                            placeholder="crit"
                            onChange={(e) =>
                              setThreshold(d.id, m, {
                                crit: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                          <select
                            className="select"
                            value={dir}
                            onChange={(e) => setThreshold(d.id, m, { direction: e.target.value })}
                          >
                            <option value="above">↑</option>
                            <option value="below">↓</option>
                          </select>
                          <button
                            className="btn"
                            title="Reset to defaults"
                            onClick={async () => {
                              try {
                                await api.putThresholds({ devices: { [d.id]: null } })
                                alert('Reset')
                              } catch {}
                            }}
                          >
                            ↺
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
