const crypto = require('crypto')

function weakEtag(obj) {
  try {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
    const h = crypto.createHash('sha1').update(json).digest('hex')
    return `W/"${h}"`
  } catch {
    return undefined
  }
}

module.exports = { weakEtag }

