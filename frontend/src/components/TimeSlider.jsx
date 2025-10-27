import { useEffect, useRef, useState } from 'react'
// Import the UI store from the state module.  The state module is
// located one level up relative to most page components.  Here we
// follow the same import path convention as other components.
import { useUiStore } from '../state/filters.js'

/**
 * A time slider that lets the user move the `anchorNow` pointer
 * backward and forward relative to the selected period.  It also
 * supports a simple playback mode to animate the dashboard over
 * time.  The slider spans a configurable number of windows
 * (default 10).  When the period changes or the current time
 * advances, the slider recalibrates itself.
 */
export default function TimeSlider({ windows = 10, stepDiv = 10 }) {
  const { anchorNow, period, setFilters } = useUiStore()
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef(null) 
  // Compute slider bounds
  const min = anchorNow - period.ms * windows
  const max = anchorNow
  const step = Math.max(1, Math.floor(period.ms / stepDiv))
  // Sync play loop
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setFilters((s) => {
          const nextTs = (s.anchorNow || Date.now()) + step
          // Loop back to min when reaching max
          const newTs = nextTs > max ? min : nextTs
          return { anchorNow: newTs }
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [playing, min, max, step, setFilters])
  // Handlers
  function onChange(e) {
    const v = Number(e.target.value)
    if (Number.isFinite(v)) setFilters({ anchorNow: v })
  }
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={anchorNow}
        onChange={onChange}
        style={{ flex: 1 }}
      />
      <span className="badge" style={{ whiteSpace: 'nowrap' }}>{new Date(anchorNow).toLocaleString()}</span>
    </div>
  )
}