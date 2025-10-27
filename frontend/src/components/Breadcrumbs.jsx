import { Link, useLocation } from 'react-router-dom'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export default function Breadcrumbs() {
  const location = useLocation()
  const { devices } = useUiStore()
  const { meta } = useAssets()

  const parts = location.pathname.split('/').filter(Boolean)
  const crumbs = [{ path: '/', label: 'Home' }]

  let acc = ''
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    acc += '/' + seg
    let label = titleCase(seg) 
    if (i === 0) {
      if (seg === 'devices') label = 'Devices'
      else if (seg === 'alerts') label = 'Alerts'
      else if (seg === 'assets') label = 'Assets'
      else if (seg === 'settings') label = 'Settings'
    }
    // Device detail: /devices/:id
    if (parts[0] === 'devices' && i === 1) {
      const id = decodeURIComponent(seg)
      const dev = devices.find(d => d.id === id)
      label = (meta[id]?.name) || dev?.name || id
    }
    crumbs.push({ path: acc, label })
  }

  // Remove duplicate Home if root only
  const items = crumbs.filter((c, idx) => !(idx > 0 && c.path === '/'))

  return (
    <nav aria-label="Breadcrumb" style={{fontSize:13, color:'#6b7280', marginTop:12}}>
      {items.map((c, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={c.path}>
            {idx > 0 && <span style={{margin: '0 8px'}}>›</span>}
            {isLast ? (
              <strong style={{color:'#111827'}}>{c.label}</strong>
            ) : (
              <Link to={c.path} style={{color:'#6b7280', textDecoration:'none'}}>{c.label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
