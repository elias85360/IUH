module.exports = {
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4000,
    corsOrigin: process.env.CORS_ORIGIN || "*",
  },
  generator: {
    intervalMs: 2000,
    jitter: 0.1, // 10% jitter on top of noise
  }, 
  devices: [
    { id: "dev-1", name: "Chaudière A", type: "boiler", room: "Salle A", tags: ["prod"] },
    { id: "dev-2", name: "Chaudière B", type: "boiler", room: "Salle B", tags: ["prod"] },
    { id: "dev-3", name: "HVAC-1", type: "hvac", room: "Hall", tags: ["clim"] },
    { id: "dev-4", name: "Pompe-1", type: "pump", room: "Sous-sol", tags: ["eau"] },
    { id: "dev-5", name: "Compresseur-1", type: "compressor", room: "Atelier", tags: ["air"] },
    { id: "dev-6", name: "Cooler-1", type: "cooler", room: "Laboratoire", tags: ["refroidissement"] },
  ],
  metrics: [
    { key: "U", unit: "V", displayName: "Voltage", thresholds: { warn: 240, crit: 250 } },
    { key: "I", unit: "A", displayName: "Current", thresholds: { warn: 15, crit: 20 } },
    { key: "P", unit: "W", displayName: "Power", thresholds: { warn: 2000, crit: 3000 } },
    { key: "E", unit: "Wh", displayName: "Energy", thresholds: { warn: 5000, crit: 10000 } },
    { key: "F", unit: "Hz", displayName: "Frequency", thresholds: { warn: 51, crit: 52 } },
    { key: "pf", unit: "", displayName: "Power Factor", thresholds: { warn: 0.8, crit: 0.7 } },
    { key: "temp", unit: "°C", displayName: "Temp", thresholds: { warn: 28, crit: 32 } },
    { key: "humid", unit: "%", displayName: "Humid", thresholds: { warn: 70, crit: 85 } },
  ],
  // Baselines by device type and metric (used by generator)
  baselines: {
    boiler: { U:{base:230,noise:5}, I:{base:8,noise:2}, P:{base:1500,noise:200}, E:{base:100,noise:20}, F:{base:50,noise:0.3}, pf:{base:0.92,noise:0.03}, temp:{base:55,noise:2}, humid:{base:45,noise:3} },
    hvac:   { U:{base:230,noise:3}, I:{base:4,noise:1}, P:{base:800,noise:120},  E:{base:60,noise:10},  F:{base:50,noise:0.2}, pf:{base:0.95,noise:0.02}, temp:{base:22,noise:1},  humid:{base:50,noise:5} },
    pump:   { U:{base:230,noise:4}, I:{base:6,noise:1.5}, P:{base:1200,noise:220},E:{base:80,noise:15},  F:{base:50,noise:0.2}, pf:{base:0.9, noise:0.03}, temp:{base:35,noise:1.5}, humid:{base:60,noise:5} },
    compressor:{U:{base:230,noise:4}, I:{base:10,noise:2}, P:{base:2200,noise:260},E:{base:140,noise:25}, F:{base:50,noise:0.4}, pf:{base:0.88,noise:0.04}, temp:{base:40,noise:2}, humid:{base:55,noise:4}},
    cooler: { U:{base:230,noise:2}, I:{base:3,noise:1}, P:{base:600,noise:120}, E:{base:40,noise:8},  F:{base:50,noise:0.2}, pf:{base:0.96,noise:0.02}, temp:{base:10,noise:1},  humid:{base:40,noise:5} },
  },
};
