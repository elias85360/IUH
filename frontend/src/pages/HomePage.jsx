import Breadcrumbs from '../components/Breadcrumbs.jsx'
import StatCards from '../components/StatCards.jsx'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { useEffect } from 'react'
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
 
export default function HomePage({ devices }) {
  const { period, anchorNow, selectedRoom } = useUiStore()
  const { meta } = useAssets()
  let visibleDevices = devices.filter(d => {
    if (!selectedRoom || selectedRoom==='all') return true
    const m = meta[d.id] || {}
    return (m.room || d.room) === selectedRoom
  })
  if (!visibleDevices.length) visibleDevices = devices
  useEffect(()=>{
    if (!devices || !devices.length) return
    try { prefetchHome(devices, { ms: period.ms }); prefetchDevices(devices, { ms: period.ms }) } catch {}
  }, [devices, period])
  console.log('Visible devices:', visibleDevices)

  return (
    <>
      <Breadcrumbs />
      <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
        <div className="badge">Energy Dashboard</div>
        <PeriodTabs />
      </div>
      <StatCards devices={visibleDevices} />
      <HomeGridLayout components={{
        mix: <EnergyMixDonut devices={visibleDevices} />,
        change: <ChangeUsageBars devices={visibleDevices} />,
        estimate: <UsageEstimateArea devices={visibleDevices} />,
        active: <ActiveDevicesBars devices={visibleDevices} onSelectDevice={(id, metric)=>{ window.location.href = `/devices/${encodeURIComponent(id)}?metric=${encodeURIComponent(metric||'P')}` }} />,
        intensity: <EnergyIntensityGauge devices={visibleDevices} />,
        carbon: <CarbonFootprintCard devices={visibleDevices} />,
        calendar: <CalendarHeatmap devices={visibleDevices} />,
        waterfall: <ContributionWaterfall devices={visibleDevices} />,
        room: <RoomContribution devices={visibleDevices} />,
        corr: <CorrelationMatrix devices={visibleDevices} />,
      }} />
    </>
  )
}
