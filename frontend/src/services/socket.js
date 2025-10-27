import { io } from 'socket.io-client'
const MODE = (import.meta.env.VITE_DATA_SOURCE || '').toLowerCase()
import { getBaseUrl } from './api.js'

let socket
export function getSocket() {
  if (MODE === 'master') {
    // No socket in kienlab mode (unless you provide a WS url separately)
    return {
      on() {}, off() {}, emit() {}, close() {},
    }
  }
  if (!socket) {
    // Derive the correct websocket URL based on the current
    // protocol.  When the page is served over HTTPS, we use wss://
    // to avoid mixed content warnings.  Otherwise ws:// is used.
    const base = getBaseUrl()
    let wsUrl = base
    if (typeof window !== 'undefined') {
      const isSecure = window.location.protocol === 'https:'
      // Replace http(s) with ws(s) prefix
      wsUrl = base.replace(/^http(s?):\/\//, isSecure ? 'wss://' : 'ws://')
    }
    socket = io(wsUrl, { transports: ['websocket'] })
  }
  return socket
}
 
export function subscribeSeries(deviceId, metricKey) {
  const s = getSocket()
  s.emit('subscribe', { room: `${deviceId}::${metricKey}` })
}
