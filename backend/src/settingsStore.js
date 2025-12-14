const { loadJSON, saveJSON } = require('./persist')

const DEFAULTS = {
  global: {
    U: { warn: 240, crit: 250, direction: 'above' },
    I: { warn: 15, crit: 20, direction: 'above' },
    P: { warn: 2000, crit: 3000, direction: 'above' },
    E: { direction: 'above' },
    F: { warn: 51.0, crit: 52.0, direction: 'above' },
    pf: { warn: 0.8, crit: 0.7, direction: 'below' },
    temp: { warn: 28, crit: 32, direction: 'above' },
    humid: { warn: 70, crit: 85, direction: 'above' },
  },
  groups: {}, // group -> { metric -> threshold }
  rooms: {}, // room -> { metric -> threshold }
  devices: {}, // deviceId -> { metric -> threshold }
  options: {
    zScore: 3,
    emailNotify: true,
    deadbandPct: 5,
    adaptiveWarnPct: 5,
    adaptiveCritPct: 10,
    adaptiveMethod: 'mean', // 'mean' | 'median'
  },
}

let settings = loadJSON('thresholds.json', DEFAULTS)

function getSettings() { return settings }

function setSettings(next, replace=false) {
  if (replace) settings = next
  else {
    // Merge, with support for null to delete device overrides
    if (next.global) settings.global = { ...(settings.global||{}), ...next.global }
    if (next.groups) settings.groups = { ...(settings.groups||{}), ...next.groups }
    if (next.rooms) settings.rooms = { ...(settings.rooms||{}), ...next.rooms }
    if (next.devices) {
      settings.devices = { ...(settings.devices||{}) }
      for (const [id, th] of Object.entries(next.devices)) {
        if (th === null) delete settings.devices[id]
        else settings.devices[id] = { ...(settings.devices[id]||{}), ...th }
      }
    }
    if (next.options) settings.options = { ...(settings.options||{}), ...next.options }
  }
  saveJSON('thresholds.json', settings)
  return settings
}

function mergeThreshold(base, over) {
  const out = { ...(base||{}) }
  for (const [k,v] of Object.entries(over||{})) out[k] = { ...(out[k]||{}), ...v }
  return out
}

function effectiveFor({ deviceId, deviceMeta }) {
  const g = deviceMeta?.group || deviceMeta?.floor || ''
  const r = deviceMeta?.room || ''
  let eff = { ...(settings.global||{}) }
  eff = mergeThreshold(eff, settings.groups?.[g])
  eff = mergeThreshold(eff, settings.rooms?.[r])
  eff = mergeThreshold(eff, settings.devices?.[deviceId])
  return eff
}

module.exports = { getSettings, setSettings, effectiveFor }
