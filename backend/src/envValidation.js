// Centralized environment validation using Zod.
// In strict mode (production or ENV_STRICT=1), invalid config fails fast.

const { z } = require('zod')

function validateEnv(opts = {}) {
  const strictFromEnv = String(process.env.ENV_STRICT || '').toLowerCase() === '1'
  const strict = typeof opts.strict === 'boolean'
    ? opts.strict
    : (process.env.NODE_ENV === 'production' || strictFromEnv)

  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.string().regex(/^\d+$/, 'PORT must be numeric').optional(),
    CORS_ORIGIN: z.string().optional(),
    DATA_SOURCE: z.enum(['mock', 'http', 'http-poll', 'poll', 'kienlab', 'kienlab-http', 'ws', 'websocket', 'mqtt']).optional(),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    KIENLAB_BASE: z.string().url().optional(),
    KIENLAB_DEVICES: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    ALERTS_TO: z.string().optional(),
    OIDC_ISSUER_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    OIDC_REQUIRE_AUD: z.string().optional(),
    RBAC_ENFORCE: z.string().optional(),
    API_KEY: z.string().optional(),
    API_HMAC_KEYS: z.string().optional(),
    API_HMAC_SECRET: z.string().optional(),
    RATE_LIMIT: z.string().optional(),
  })

  const issues = []
  const res = schema.safeParse(process.env)
  if (!res.success) {
    for (const issue of res.error.issues) {
      issues.push({ path: issue.path.join('.'), message: issue.message })
    }
  }

  const env = process.env

  // KIENLAB strict requirements
  const ds = String(env.DATA_SOURCE || '').toLowerCase()
  if (ds === 'kienlab' || ds === 'kienlab-http') {
    if (!env.KIENLAB_BASE) issues.push({ path: 'KIENLAB_BASE', message: 'KIENLAB_BASE must be set when DATA_SOURCE=kienlab' })
    if (!env.KIENLAB_DEVICES) issues.push({ path: 'KIENLAB_DEVICES', message: 'KIENLAB_DEVICES must be set when DATA_SOURCE=kienlab' })
  }

  // Timescale requirements
  const tsdbNeeded = String(env.TSDB_MIRROR || '').toLowerCase() === '1' || String(env.TSDB_READ || '').toLowerCase() === '1'
  if (tsdbNeeded && !env.DATABASE_URL) {
    issues.push({ path: 'DATABASE_URL', message: 'DATABASE_URL must be set when TSDB_MIRROR=1 or TSDB_READ=1' })
  }

  // RBAC/OIDC requirements
  if (String(env.RBAC_ENFORCE || '').toLowerCase() === '1') {
    if (!env.OIDC_ISSUER_URL) issues.push({ path: 'OIDC_ISSUER_URL', message: 'OIDC_ISSUER_URL is required when RBAC_ENFORCE=1' })
    if (!env.OIDC_CLIENT_ID) issues.push({ path: 'OIDC_CLIENT_ID', message: 'OIDC_CLIENT_ID is required when RBAC_ENFORCE=1' })
    if (String(env.ALLOW_API_KEY_WITH_RBAC || '1') === '1' && !env.API_KEY) {
      issues.push({ path: 'API_KEY', message: 'API_KEY should be set when RBAC_ENFORCE=1 and ALLOW_API_KEY_WITH_RBAC=1' })
    }
  }

  // Alerts email minimal config
  if (env.ALERTS_TO && (!env.SMTP_HOST || !env.SMTP_PORT)) {
    issues.push({ path: 'SMTP_HOST/SMTP_PORT', message: 'SMTP_HOST and SMTP_PORT should be set when ALERTS_TO is configured' })
  }

  // HMAC enforce requires at least one key source
  if (String(env.API_HMAC_ENFORCE || '').toLowerCase() === '1') {
    const hasKeys = !!env.API_HMAC_KEYS || !!env.API_HMAC_SECRET
    if (!hasKeys) issues.push({ path: 'API_HMAC_KEYS', message: 'API_HMAC_ENFORCE=1 requires API_HMAC_KEYS or API_HMAC_SECRET' })
  }

  if (!issues.length) return

  console.error('[env] Potential configuration issues:')
  for (const i of issues) console.error(` - ${i.path}: ${i.message}`)

  if (strict) throw new Error(`Invalid environment configuration (${issues.length} issue(s))`)
}

module.exports = { validateEnv }
