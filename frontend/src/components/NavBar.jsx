import { NavLink } from 'react-router-dom'
import { useAlerts } from '../state/alerts.js'

export default function NavBar() {
  const linkStyle = ({ isActive }) => ({ color:'#e5e7eb', textDecoration:'none', opacity:isActive?1:0.85, fontWeight:isActive?700:500 })
  const { log } = useAlerts()
  const alertCount = log?.length || 0
  return (
    <div style={{background:'#1f2a56', color:'#fff', height:56, display:'flex', alignItems:'center', padding:'0 16px', boxShadow:'0 2px 6px rgba(0,0,0,0.1)'}}>
      <div style={{fontWeight:700, marginRight:24}}>ThingsBoard</div>
      <div style={{display:'flex', gap:16}}>
        <NavLink to="/" style={linkStyle}>Home</NavLink>
        <NavLink to="/devices" style={linkStyle}>Devices</NavLink>
        <NavLink to="/alerts" style={linkStyle}>Alerts{alertCount>0 && <span className="badge" style={{marginLeft:6, background:'#fff', color:'#ef4444', borderColor:'#ef4444'}}>{alertCount}</span>}</NavLink>
        <NavLink to="/assets" style={linkStyle}>Assets</NavLink>
        <NavLink to="/settings" style={linkStyle}>Settings</NavLink>
      </div>
      <div style={{marginLeft:'auto', display:'flex', gap:12, alignItems:'center'}}>
        <span style={{opacity:.8}}>mail@thingsboard.org</span>
        <span className="tag">System administrator</span>
      </div>
    </div> 
  )
}
