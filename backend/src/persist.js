const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function dataPath(file) {
  const dir = path.resolve(process.cwd(), 'backend', 'data')
  ensureDir(dir)
  return path.join(dir, file)
}

function loadJSON(file, defVal) {
  try {
    const p = dataPath(file)
    if (!fs.existsSync(p)) return defVal
    const txt = fs.readFileSync(p, 'utf8')
    return JSON.parse(txt)
  } catch { return defVal }
}

function saveJSON(file, obj) {
  try {
    const p = dataPath(file)
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
    return true
  } catch { return false }
}

module.exports = { loadJSON, saveJSON }

