import StatCards from '../components/StatCards.jsx'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { useEffect, useMemo } from 'react'
import { prefetchHome, prefetchDevices } from '../lib/prefetch.js'

import EnergyMixDonut from '../components/EnergyMixDonut.jsx'
import ChangeUsageBars from '../components/ChangeUsageBars.jsx'
import UsageEstimateArea from '../components/UsageEstimateArea.jsx'
import ActiveDevicesBars from '../components/ActiveDevicesBars.jsx'
import EnergyIntensityGauge from '../components/EnergyIntensityGauge.jsx'
import RoomContribution from '../components/RoomContribution.jsx'
import HomeHealthAlerts from '../components/HomeHealthAlerts.jsx'

import { Doughnut } from 'react-chartjs-2'

export default function HomePage({ devices }) {
  // Filtres globaux
  const { period, selectedRoom, selectedTags, setFilters } = useUiStore()
  const { meta } = useAssets()

  // Filtrage des devices visibles (garde ta logique)
  let visibleDevices = devices.filter(d => {
    if (!selectedRoom || selectedRoom === 'all') return true
    const m = meta[d.id] || {}
    return (m.room || d.room) === selectedRoom
  })
  visibleDevices = visibleDevices.filter(d => !(meta[d.id]?.exclude))
  if (selectedTags && selectedTags.length) {
    visibleDevices = visibleDevices.filter(d => {
      const m = meta[d.id] || {}
      const tags = (m.tags || d.tags || [])
      return selectedTags.every(t => tags.includes(t))
    })
  }
  if (!visibleDevices.length) visibleDevices = devices.filter(d => !(meta[d.id]?.exclude))

  // Prefetch
  useEffect(()=>{
    if (!devices || !devices.length) return
    try { prefetchHome(devices, { ms: period.ms }); prefetchDevices(devices, { ms: period.ms }) } catch {}
  }, [devices, period])

  function clearRoom(){ setFilters({ selectedRoom: 'all' }) }
  function clearTag(tag){
    const next = (selectedTags||[]).filter(t => t !== tag)
    setFilters({ selectedTags: next })
  }

  // Donut KPI (anneau) – simple visuel (OK vs Late); à brancher si tu veux une vraie métrique d’uptime
  const kpiDonut = useMemo(()=>{
    const ok = 80, late = 20
    return {
      labels: ['OK', 'Late'],
      datasets: [{ data: [ok, late], backgroundColor: ['#22c55e','#e5e7eb'], borderWidth: 0, cutout: '70%' }]
    }
  },[])

  return (
    <>
      {/* Chips de filtres actifs */}
      <div className="row" style={{gap:8, margin:'6px 0 14px'}}>
        {selectedRoom && selectedRoom!=='all' && (
          <span className="badge">Room: {selectedRoom} <button className="btn" onClick={clearRoom}>✕</button></span>
        )}
        {(selectedTags||[]).map(tag => (
          <span key={tag} className="badge">Tag: {tag} <button className="btn" onClick={()=>clearTag(tag)}>✕</button></span>
        ))}
      </div>

      {/* Grille 3 colonnes (look maquette) */}
      <div className="dashboard-v2">

        {/* 1) Bar chart (gauche haut) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Daily Usage</h3>
          </div>
          <div className="card-body">
            <ChangeUsageBars devices={visibleDevices} />
          </div>
        </section>

        {/* 2) KPIs (milieu haut) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Summary</h3>
          </div>
          <div className="card-body">
            <StatCards devices={visibleDevices} />
          </div>
        </section>

        {/* 3) Anneaux KPI (droite haut) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">KPI Rings</h3>
          </div>
          <div className="card-body">
            <div className="kpi-ring">
              <div style={{width:140, height:140}}>
                <Doughnut data={kpiDonut} options={{plugins:{legend:{display:false}}, animation:false, maintainAspectRatio:false}} />
              </div>
              <div>
                <div className="v">80%</div>
                <div className="s">Uptime</div>
              </div>
              <div style={{flex:1, minWidth:160}}>
                <EnergyIntensityGauge devices={visibleDevices} />
              </div>
            </div>
          </div>
        </section>

        {/* 4) Grouped bars (2e ligne gauche) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Active Devices</h3>
          </div>
          <div className="card-body">
            <ActiveDevicesBars devices={visibleDevices} />
          </div>
        </section>

        {/* 5) Area trend (2e ligne milieu) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Estimate Trend</h3>
          </div>
          <div className="card-body">
            <UsageEstimateArea devices={visibleDevices} />
          </div>
        </section>

        {/* 6) Bar by room (2e ligne droite) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Room Contribution</h3>
          </div>
          <div className="card-body">
            <RoomContribution
              devices={visibleDevices}
              onSelectRoom={(room)=> setFilters({ selectedRoom: room })}
            />
          </div>
        </section>

        {/* 7) Donut (3e ligne gauche, col-span-2 pour ressembler à la tuile large) */}
        <section className="card-v2 col-span-2">
          <div className="card-head">
            <h3 className="card-title">Energy Mix</h3>
          </div>
          <div className="card-body">
            <EnergyMixDonut
              devices={visibleDevices}
              onSlice={(id, metric)=>{ window.location.href = `/devices/${encodeURIComponent(id)}?metric=${encodeURIComponent(metric||'P')}` }}
            />
          </div>
        </section>

        {/* 8) Health / Alerts (3e ligne droite) */}
        <section className="card-v2">
          <div className="card-head">
            <h3 className="card-title">Data Health</h3>
          </div>
          <div className="card-body">
            <HomeHealthAlerts />
          </div>
        </section>

      </div>
    </>
  )
}
