async function startMqtt({ store }) {
  let mqtt
  try {
    mqtt = require('mqtt')
  } catch {
    console.error('[mqtt] Missing dependency mqtt. Run: npm i mqtt')
    return { stop: () => {}, id: 'mqtt-missing' }
  } 
  const url = process.env.REMOTE_MQTT_URL
  const topic = process.env.REMOTE_MQTT_TOPIC || 'points/#'
  if (!url) {
    console.warn('[mqtt] REMOTE_MQTT_URL not set; adapter idle')
    return { stop: () => {}, id: 'mqtt-idle' }
  }
  const client = mqtt.connect(url, {
    username: process.env.REMOTE_MQTT_USER,
    password: process.env.REMOTE_MQTT_PASS,
  })
  const { mapRemoteToPoints } = require('../sourceMapping')
  client.on('connect', () => client.subscribe(topic))
  client.on('message', (t, msg) => {
    try {
      const payload = JSON.parse(msg.toString())
      const points = mapRemoteToPoints(payload)
      for (const p of points) store.addPoint(p.deviceId, p.metricKey, Number(p.ts), Number(p.value))
    } catch {
      // ignore non-JSON messages
    }
  })
  return { id: 'mqtt', stop: () => { try { client.end(true) } catch {} } }
}

module.exports = { startMqtt }

