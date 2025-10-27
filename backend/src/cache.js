// Simple cache layer with optional Redis backend.
// If REDIS_URL is set and ioredis is available, use Redis. Otherwise
// fallback to in-memory TTL cache.

const crypto = require('crypto')

let redis = null
function getRedis() {
  if (redis !== null) return redis
  try {
    if (!process.env.REDIS_URL) { redis = false; return null }
    const Redis = require('ioredis')
    redis = new Redis(process.env.REDIS_URL, { lazyConnect: true })
    redis.on('error', () => {})
    return redis
  } catch {
    redis = false
    return null
  }
}

const mem = new Map() // key -> { exp, val }

function now() { return Date.now() }

async function cacheGet(key) {
  const r = getRedis()
  if (r) {
    try { const v = await r.get(key); return v ? JSON.parse(v) : null } catch { return null }
  }
  const it = mem.get(key)
  if (!it) return null
  if (it.exp && it.exp < now()) { mem.delete(key); return null }
  return it.val
}

async function cacheSet(key, val, ttlSec = 10) {
  const r = getRedis()
  const text = JSON.stringify(val)
  if (r) {
    try { await r.set(key, text, 'EX', Math.max(1, Math.floor(ttlSec))) } catch {}
    return
  }
  mem.set(key, { val, exp: now() + ttlSec * 1000 })
}

function makeKey(prefix, obj) {
  const base = JSON.stringify(obj)
  const h = crypto.createHash('sha1').update(base).digest('hex')
  return `${prefix}:${h}`
}

module.exports = { cacheGet, cacheSet, makeKey }

