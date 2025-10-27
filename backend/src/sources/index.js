const { startMock } = require('./mock')
const { startHttpPolling } = require('./httpPoll')
const { startWebSocket } = require('./ws')
const { startMqtt } = require('./mqtt')
const { startKienlabHttp } = require('./kienlab')
 
function startIngestion({ store, config }) {
  const mode = (process.env.DATA_SOURCE || 'mock').toLowerCase()
  console.log('[ingestion] DATA_SOURCE =', mode)
  if (mode === 'mock') return startMock({ store, config })
  if (mode === 'http' || mode === 'http-poll' || mode === 'poll') return startHttpPolling({ store })
  if (mode === 'kienlab' || mode === 'kienlab-http') return startKienlabHttp({ store })
  if (mode === 'ws' || mode === 'websocket') return startWebSocket({ store })
  if (mode === 'mqtt') return startMqtt({ store })
  console.warn('[ingestion] Unknown DATA_SOURCE, falling back to mock')
  return startMock({ store, config })
}

module.exports = { startIngestion }
