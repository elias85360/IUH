import { useEffect, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const defaultLayout = [
  { i: 'mix', x: 0,  y: 0, w: 4, h: 7 },
  { i: 'change', x: 4, y: 0, w: 4, h: 7 },
  { i: 'estimate', x: 8, y: 0, w: 4, h: 7 },
  { i: 'active', x: 0, y: 7, w: 6, h: 7 },
  { i: 'intensity', x: 6, y: 7, w: 6, h: 7 },
  { i: 'carbon', x: 0, y: 14, w: 4, h: 6 },
  { i: 'calendar', x: 4, y: 14, w: 4, h: 6 },
  { i: 'waterfall', x: 8, y: 14, w: 4, h: 6 },
  { i: 'corr', x: 0, y: 20, w: 4, h: 6 },
  { i: 'room', x: 4, y: 20, w: 8, h: 8 },
]

export default function HomeGridLayout({ components }) {
  // Fixed layout: ignore any saved user layout and do not persist changes
  const layout = defaultLayout

  const layouts = { lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }
  const cols = { lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{
    const on = () => setIsMobile(window.innerWidth < 768)
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const rowHeight = isMobile ? 40 : 52

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
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      cols={cols}
      breakpoints={breakpoints}
      rowHeight={rowHeight}
      margin={[isMobile?8:16, isMobile?8:16]}
      // Fixed layout: no drag/resize, no persistence
      isDraggable={false}
      isResizable={false}
      draggableHandle=".panel-title"
    >
      {layout.map(renderItem)}
    </ResponsiveGridLayout>
  )
}
