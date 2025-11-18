const { Server } = require("socket.io");
const { incSocketConnections, decSocketConnections, recordAlert } = require('./metrics')

const VOLATILE_POINTS = String(process.env.SOCKET_VOLATILE_POINTS || '1') === '1'
const POINT_MIN_INTERVAL_MS = Math.max(0, Number(process.env.SOCKET_POINT_MIN_INTERVAL_MS || 100))
const MAX_BROADCASTS_PER_SEC = Math.max(100, Number(process.env.SOCKET_MAX_BROADCASTS_PER_SEC || 20000))
const lastSentByKey = new Map()
let tickCount = 0
setInterval(() => { tickCount = 0 }, 1000)

function attachSocket({ server, store, corsOrigin = "*" }) {
  const io = new Server(server, {
    cors: { origin: corsOrigin },
    perMessageDeflate: { threshold: 1024 },
  });

  io.on("connection", (socket) => {
    try { incSocketConnections() } catch {}
    socket.emit("hello", { ok: true, ts: Date.now() });
    // Client can subscribe to a device/metric room if desired later
    socket.on("subscribe", ({ room }) => {
      if (room) socket.join(room);
    });
    socket.on('disconnect', () => { try { decSocketConnections() } catch {} })
  }); 

  // Broadcast new points and alerts
  store.emitter.on("point", (payload) => {
    const now = Date.now()
    const key = `${payload.deviceId}::${payload.metricKey}`
    const last = lastSentByKey.get(key) || 0
    if (POINT_MIN_INTERVAL_MS && (now - last) < POINT_MIN_INTERVAL_MS) return
    if (tickCount >= MAX_BROADCASTS_PER_SEC) return
    lastSentByKey.set(key, now)
    tickCount++
    const room = `${payload.deviceId}::${payload.metricKey}`
    if (VOLATILE_POINTS) {
      io.volatile.emit('point', payload)
      io.to(room).volatile.emit('point', payload)
    } else {
      io.emit('point', payload)
      io.to(room).emit('point', payload)
    }
  });

  store.emitter.on("alert", (payload) => {
    try { recordAlert(payload.level, payload.metricKey) } catch {}
    io.emit("alert", payload);
    const room = `${payload.deviceId}::${payload.metricKey}`;
    io.to(room).emit("alert", payload);
  });

  return io;
}

module.exports = { attachSocket };

