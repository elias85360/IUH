const { loadJSON, saveJSON } = require('./persist')

let meta = loadJSON('assets-meta.json', {}) // deviceId -> { name, group, room, tags[], description }

function getMeta() { return meta }

function setMeta(updates, replace=false) {
  if (replace) {
    meta = updates || {}
  } else {
    for (const [id, patch] of Object.entries(updates || {})) {
      const curr = meta[id] || {}
      const next = { ...curr, ...patch }
      if (Array.isArray(next.tags)) next.tags = next.tags.filter(Boolean)
      meta[id] = next
    }
  }
  saveJSON('assets-meta.json', meta)
  return meta
}

module.exports = { getMeta, setMeta }

