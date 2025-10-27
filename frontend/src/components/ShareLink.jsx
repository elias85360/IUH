import { useUiStore } from '../state/filters.js'

export default function ShareLink() {
  const { period, selectedRoom, selectedGroup } = useUiStore()
  function copy() {
    const url = new URL(window.location.href)
    url.searchParams.set('period', period.key || '24h')
    if (selectedRoom) url.searchParams.set('room', selectedRoom)
    if (selectedGroup) url.searchParams.set('group', selectedGroup)
    try {
      const layout = localStorage.getItem('home-layout')
      if (layout) url.searchParams.set('layout', encodeURIComponent(layout))
    } catch {}
    navigator.clipboard.writeText(url.toString())
  }
  return <button className="btn" onClick={copy}>Copy Share Link</button>
}
 