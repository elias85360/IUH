import Breadcrumbs from '../components/Breadcrumbs.jsx'
import StatCards from '../components/StatCards.jsx'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { useEffect, useState } from 'react'
import { prefetchHome, prefetchDevices } from '../lib/prefetch.js'
import PeriodTabs from '../components/PeriodTabs.jsx'
import EnergyMixDonut from '../components/EnergyMixDonut.jsx'
import ChangeUsageBars from '../components/ChangeUsageBars.jsx'
import UsageEstimateArea from '../components/UsageEstimateArea.jsx'
import ActiveDevicesBars from '../components/ActiveDevicesBars.jsx'
import EnergyIntensityGauge from '../components/EnergyIntensityGauge.jsx'
import CarbonFootprintCard from '../components/CarbonFootprintCard.jsx'
import CalendarHeatmap from '../components/CalendarHeatmap.jsx'
import ContributionWaterfall from '../components/ContributionWaterfall.jsx'
import RoomContribution from '../components/RoomContribution.jsx'
import HomeGridLayout from '../components/HomeGridLayout.jsx'
import CorrelationMatrix from '../components/CorrelationMatrix.jsx'
import HomeHealthAlerts from '../components/HomeHealthAlerts.jsx'
import ComparePanel from '../components/ComparePanel.jsx'
import HomeAnomalies from '../components/HomeAnomalies.jsx'
 
export default function HomePage({ devices }) {
  const { period, anchorNow, selectedRoom, selectedTags, setFilters } = useUiStore()
  const [showCompare, setShowCompare] = useState(false)
  const { meta } = useAssets()
  let visibleDevices = devices.filter(d => {
    if (!selectedRoom || selectedRoom==='all') return true
    const m = meta[d.id] || {}
    return (m.room || d.room) === selectedRoom
  })
  // Exclude devices marked as excluded in meta
  visibleDevices = visibleDevices.filter(d => !(meta[d.id]?.exclude))
  if (selectedTags && selectedTags.length) {
    visibleDevices = visibleDevices.filter(d => {
      const m = meta[d.id] || {}
      const tags = (m.tags || d.tags || [])
      return selectedTags.every(t => tags.includes(t))
    })
  }
  if (!visibleDevices.length) visibleDevices = devices.filter(d => !(meta[d.id]?.exclude))
  useEffect(()=>{
    if (!devices || !devices.length) return
    try { prefetchHome(devices, { ms: period.ms }); prefetchDevices(devices, { ms: period.ms }) } catch {}
  }, [devices, period])
  console.log('Visible devices:', visibleDevices)

  function clearRoom(){ setFilters({ selectedRoom: 'all' }) }
  function clearTag(tag){
    const next = (selectedTags||[]).filter(t => t !== tag)
    setFilters({ selectedTags: next })
  }

  const presets = {
    operations: [
      { i: 'active', x: 0, y: 0, w: 6, h: 7 },
      { i: 'mix', x: 6, y: 0, w: 6, h: 7 },
      { i: 'room', x: 0, y: 7, w: 12, h: 8 },
      { i: 'change', x: 0, y: 15, w: 6, h: 7 },
      { i: 'estimate', x: 6, y: 15, w: 6, h: 7 },
      { i: 'anomalies', x: 0, y: 22, w: 6, h: 6 },
      { i: 'health', x: 0, y: 22, w: 12, h: 6 },
    ],
    energy: [
      { i: 'mix', x: 0, y: 0, w: 4, h: 7 },
      { i: 'change', x: 4, y: 0, w: 4, h: 7 },
      { i: 'estimate', x: 8, y: 0, w: 4, h: 7 },
      { i: 'waterfall', x: 0, y: 7, w: 6, h: 7 },
      { i: 'calendar', x: 6, y: 7, w: 6, h: 7 },
      { i: 'corr', x: 0, y: 14, w: 4, h: 6 },
      { i: 'intensity', x: 4, y: 14, w: 4, h: 6 },
      { i: 'carbon', x: 8, y: 14, w: 4, h: 6 },
      { i: 'room', x: 0, y: 20, w: 12, h: 8 },
      { i: 'anomalies', x: 0, y: 28, w: 6, h: 6 },
      { i: 'health', x: 0, y: 28, w: 12, h: 6 },
    ]
  }

  function applyPreset(key){ try { localStorage.setItem('home-layout', JSON.stringify(presets[key])) } catch {}; window.location.reload() }

  return (
    <>
      <Breadcrumbs />
      <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
        <div className="badge">Energy Dashboard</div>
        <div className="row" style={{gap:8, alignItems:'center'}}>
          <button className="btn" onClick={()=>setShowCompare(v=>!v)}>{showCompare? 'Hide Compare':'Show Compare'}</button>
          <button className="btn" onClick={()=>applyPreset('operations')}>Preset: Operations</button>
          <button className="btn" onClick={()=>applyPreset('energy')}>Preset: Energy</button>
          <button className="btn" onClick={()=>{ try{ localStorage.removeItem('home-layout') }catch{}; window.location.reload() }}>Reset Layout</button>
          <PeriodTabs />
        </div>
      </div>
      <StatCards devices={visibleDevices} />
      {showCompare && <ComparePanel devices={visibleDevices} period={period} />}
      {/* Active filter chips */}
      <div className="row" style={{gap:8, margin:'8px 0'}}>
        {selectedRoom && selectedRoom!=='all' && (
          <span className="badge">Room: {selectedRoom} <button className="btn" onClick={clearRoom}>✕</button></span>
        )}
        {(selectedTags||[]).map(tag => (
          <span key={tag} className="badge">Tag: {tag} <button className="btn" onClick={()=>clearTag(tag)}>✕</button></span>
        ))}
      </div>
      <HomeGridLayout components={{
        mix: <EnergyMixDonut devices={visibleDevices} onSlice={(id, metric)=>{ window.location.href = `/devices/${encodeURIComponent(id)}?metric=${encodeURIComponent(metric||'P')}` }} />,
        change: <ChangeUsageBars devices={visibleDevices} />,
        estimate: <UsageEstimateArea devices={visibleDevices} />,
        active: <ActiveDevicesBars devices={visibleDevices} onSelectDevice={(id, metric)=>{ window.location.href = `/devices/${encodeURIComponent(id)}?metric=${encodeURIComponent(metric||'P')}` }} />,
        intensity: <EnergyIntensityGauge devices={visibleDevices} />,
        carbon: <CarbonFootprintCard devices={visibleDevices} />,
        calendar: <CalendarHeatmap devices={visibleDevices} />,
        waterfall: <ContributionWaterfall devices={visibleDevices} />,
        room: <RoomContribution devices={visibleDevices} onSelectRoom={(room)=> setFilters({ selectedRoom: room })} />,
        corr: <CorrelationMatrix devices={visibleDevices} />,
        health: <HomeHealthAlerts />,
        anomalies: <HomeAnomalies devices={visibleDevices} />,
      }} />
    </>
  )
}
