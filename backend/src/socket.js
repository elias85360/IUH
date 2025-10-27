const { Server } = require("socket.io");

function attachSocket({ server, store, corsOrigin = "*" }) {
  const io = new Server(server, {
    cors: { origin: corsOrigin },
  });

  io.on("connection", (socket) => {
    socket.emit("hello", { ok: true, ts: Date.now() });
    // Client can subscribe to a device/metric room if desired later
    socket.on("subscribe", ({ room }) => {
      if (room) socket.join(room);
    });
  }); 

  // Broadcast new points and alerts
  store.emitter.on("point", (payload) => {
    io.emit("point", payload);
    // Also emit to specific room if client wants to filter per device/metric
    const room = `${payload.deviceId}::${payload.metricKey}`;
    io.to(room).emit("point", payload);
  });

  store.emitter.on("alert", (payload) => {
    io.emit("alert", payload);
    const room = `${payload.deviceId}::${payload.metricKey}`;
    io.to(room).emit("alert", payload);
  });

  return io;
}

module.exports = { attachSocket };

