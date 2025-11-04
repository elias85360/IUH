import { useEffect, useMemo, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Default responsive layouts
const defaultLayouts = {
  xl: [
    { i: 'mix', x: 0,  y: 0, w: 4, h: 7 },
    { i: 'change', x: 4, y: 0, w: 4, h: 7 },
    { i: 'estimate', x: 8, y: 0, w: 4, h: 7 },
    { i: 'active', x: 0, y: 7, w: 8, h: 8 },
    { i: 'intensity', x: 8, y: 7, w: 4, h: 8 },
    { i: 'calendar', x: 0, y: 15, w: 6, h: 7 },
    { i: 'waterfall', x: 6, y: 15, w: 6, h: 7 },
    { i: 'corr', x: 0, y: 22, w: 4, h: 6 },
    { i: 'carbon', x: 4, y: 22, w: 4, h: 6 },
    { i: 'room', x: 8, y: 22, w: 4, h: 6 },
    { i: 'anomalies', x: 0, y: 28, w: 6, h: 6 },
    { i: 'health', x: 0, y: 34, w: 12, h: 6 },
  ],
  lg: [
    { i: 'mix', x: 0,  y: 0, w: 4, h: 7 },
    { i: 'change', x: 4, y: 0, w: 4, h: 7 },
    { i: 'estimate', x: 8, y: 0, w: 4, h: 7 },
    { i: 'active', x: 0, y: 7, w: 6, h: 7 },
    { i: 'intensity', x: 6, y: 7, w: 6, h: 7 },
    { i: 'calendar', x: 0, y: 14, w: 6, h: 7 },
    { i: 'waterfall', x: 6, y: 14, w: 6, h: 7 },
    { i: 'corr', x: 0, y: 21, w: 4, h: 6 },
    { i: 'carbon', x: 4, y: 21, w: 4, h: 6 },
    { i: 'room', x: 8, y: 21, w: 4, h: 6 },
    { i: 'anomalies', x: 0, y: 27, w: 6, h: 6 },
    { i: 'health', x: 0, y: 33, w: 12, h: 6 },
  ],
  md: [
    { i: 'mix', x: 0,  y: 0, w: 6, h: 7 },
    { i: 'change', x: 6, y: 0, w: 6, h: 7 },
    { i: 'estimate', x: 0, y: 7, w: 6, h: 7 },
    { i: 'active', x: 6, y: 7, w: 6, h: 7 },
    { i: 'intensity', x: 0, y: 14, w: 6, h: 7 },
    { i: 'calendar', x: 6, y: 14, w: 6, h: 7 },
    { i: 'waterfall', x: 0, y: 21, w: 6, h: 7 },
    { i: 'corr', x: 6, y: 21, w: 6, h: 6 },
    { i: 'carbon', x: 0, y: 27, w: 6, h: 6 },
    { i: 'room', x: 6, y: 27, w: 6, h: 6 },
    { i: 'anomalies', x: 0, y: 33, w: 12, h: 6 },
    { i: 'health', x: 0, y: 39, w: 12, h: 6 },
  ],
  sm: [
    { i: 'mix', x: 0, y: 0, w: 12, h: 6 },
    { i: 'change', x: 0, y: 6, w: 12, h: 6 },
    { i: 'estimate', x: 0, y: 12, w: 12, h: 6 },
    { i: 'active', x: 0, y: 18, w: 12, h: 6 },
    { i: 'intensity', x: 0, y: 24, w: 12, h: 6 },
    { i: 'calendar', x: 0, y: 30, w: 12, h: 6 },
    { i: 'waterfall', x: 0, y: 36, w: 12, h: 6 },
    { i: 'corr', x: 0, y: 42, w: 12, h: 6 },
    { i: 'carbon', x: 0, y: 48, w: 12, h: 6 },
    { i: 'room', x: 0, y: 54, w: 12, h: 6 },
    { i: 'anomalies', x: 0, y: 60, w: 12, h: 6 },
    { i: 'health', x: 0, y: 66, w: 12, h: 6 },
  ],
  xs: [
    { i: 'mix', x: 0, y: 0, w: 12, h: 6 },
    { i: 'change', x: 0, y: 6, w: 12, h: 6 },
    { i: 'estimate', x: 0, y: 12, w: 12, h: 6 },
    { i: 'active', x: 0, y: 18, w: 12, h: 6 },
    { i: 'intensity', x: 0, y: 24, w: 12, h: 6 },
    { i: 'calendar', x: 0, y: 30, w: 12, h: 6 },
    { i: 'waterfall', x: 0, y: 36, w: 12, h: 6 },
    { i: 'corr', x: 0, y: 42, w: 12, h: 6 },
    { i: 'carbon', x: 0, y: 48, w: 12, h: 6 },
    { i: 'room', x: 0, y: 54, w: 12, h: 6 },
    { i: 'anomalies', x: 0, y: 60, w: 12, h: 6 },
    { i: 'health', x: 0, y: 66, w: 12, h: 6 },
  ],
}

function readLayouts() {
  try {
    const s = localStorage.getItem('home-layouts')
    if (!s) return defaultLayouts
    const obj = JSON.parse(s)
    if (obj && typeof obj === 'object') return { ...defaultLayouts, ...obj }
    return defaultLayouts
  } catch { return defaultLayouts }
}

export default function HomeGridLayout({ components }) {
  const [layouts, setLayouts] = useState(readLayouts())
  const [precise, setPrecise] = useState(() => { try { return localStorage.getItem('home-precise')==='1' } catch { return false } })
  const [edit, setEdit] = useState(false)

  const cols = { xl: 12, lg: 12, md: 12, sm: 12, xs: 12 }
  const breakpoints = { xl: 1600, lg: 1200, md: 996, sm: 768, xs: 0 }
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{
    const on = () => setIsMobile(window.innerWidth < 768)
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const rowHeight = useMemo(()=>{
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200
    if (w >= 1600) return 72 // TV/XL
    if (w >= 1200) return 60 // Desktop
    if (w >= 996) return 54 // Laptop
    if (w >= 768) return 50 // Tablet
    return 42 // Mobile
  }, [])

  function renderItem(item) {
    const Comp = components[item.i]
    if (!Comp) return null
    return (
      <div key={item.i} data-grid={item}>
        {Comp}
      </div>
    )
  }


  return (
    <>
      <div className="row" style={{justifyContent:'space-between', margin:'8px 0'}}>
        <div className="row" style={{gap:8}}>
          <button className={`btn ${edit? 'primary':''}`} onClick={()=> setEdit(e=>!e)} title="Réorganiser les cartes">{edit? 'Terminer l\'édition' : 'Éditer la mise en page'}</button>
          <button className="btn" onClick={()=>{ try { localStorage.removeItem('home-layouts') } catch {}; setLayouts(defaultLayouts) }} title="Réinitialise la mise en page">Réinitialiser</button>
        </div>
        <button className={`btn ${precise? 'primary':''}`} onClick={()=>{ try{ const next=!precise; setPrecise(next); localStorage.setItem('home-precise', next?'1':'0') }catch{}; window.location.reload() }} title="Augmente la précision (bucket plus fin)">Précision</button>
      </div>
      <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      cols={cols}
      breakpoints={breakpoints}
      rowHeight={rowHeight}
      margin={[isMobile?8:16, isMobile?8:16]}
      isDraggable={edit}
      isResizable={edit}
      draggableHandle=".panel-title"
      onLayoutChange={(_, allLayouts)=>{
        try { localStorage.setItem('home-layouts', JSON.stringify(allLayouts)) } catch {}
        setLayouts(allLayouts)
      }}
    >
      {(layouts.xl || defaultLayouts.xl).map(renderItem)}
    </ResponsiveGridLayout>
    </>
  )
}
