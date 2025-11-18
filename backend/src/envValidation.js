// Validation centralisée de la configuration ENV du backend.
// Utilise zod (déjà présent) pour contrôler les combinaisons de variables.
// En mode strict (ENV_STRICT=1 ou NODE_ENV=production), une config invalide
// fait échouer le démarrage.

const { z } = require('zod')

function validateEnv(opts = {}) {
  const strictFromEnv = String(process.env.ENV_STRICT || '').toLowerCase() === '1'
  const strict =
    typeof opts.strict === 'boolean'
      ? opts.strict
      : (process.env.NODE_ENV === 'production' || strictFromEnv)

  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    DATA_SOURCE: z
      .enum(['mock', 'http', 'http-poll', 'poll', 'kienlab', 'kienlab-http', 'ws', 'websocket', 'mqtt'])
      .optional(),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    KIENLAB_BASE: z.string().url().optional(),
    KIENLAB_DEVICES: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    ALERTS_TO: z.string().optional(),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    RATE_LIMIT: z.string().optional(),
  })

  const result = schema.safeParse(process.env)
  const issues = []

  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        path: issue.path.join('.'),
        message: issue.message,
      })
    }
  }

  const env = process.env

  // Mode KIENLAB => base + liste de devices obligatoires
  const ds = String(env.DATA_SOURCE || '').toLowerCase()
  if (ds === 'kienlab' || ds === 'kienlab-http') {
    if (!env.KIENLAB_BASE) {
      issues.push({ path: 'KIENLAB_BASE', message: 'KIENLAB_BASE must be set when DATA_SOURCE=kienlab' })
    }
    if (!env.KIENLAB_DEVICES) {
      issues.push({ path: 'KIENLAB_DEVICES', message: 'KIENLAB_DEVICES must be set when DATA_SOURCE=kienlab' })
    }
  }

  // Mirroring Timescale => DATABASE_URL obligatoire
  if (String(env.TSDB_MIRROR || '').toLowerCase() === '1' && !env.DATABASE_URL) {
    issues.push({
      path: 'DATABASE_URL',
      message: 'DATABASE_URL must be set when TSDB_MIRROR=1',
    })
  }

  // RBAC/OIDC forcé => issuer + client_id requis
  if (String(env.OIDC_ENFORCE || '').toLowerCase() === '1') {
    if (!env.OIDC_ISSUER) {
      issues.push({ path: 'OIDC_ISSUER', message: 'OIDC_ISSUER is required when OIDC_ENFORCE=1' })
    }
    if (!env.OIDC_CLIENT_ID) {
      issues.push({ path: 'OIDC_CLIENT_ID', message: 'OIDC_CLIENT_ID is required when OIDC_ENFORCE=1' })
    }
  }

  // Si alertes mail, config SMTP minimale
  const wantEmailAlerts = !!env.ALERTS_TO
  if (wantEmailAlerts) {
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      issues.push({
        path: 'SMTP_HOST/SMTP_PORT',
        message: 'SMTP_HOST and SMTP_PORT should be set when ALERTS_TO is configured',
      })
    }
  }

  if (!issues.length) return

  console.error('[env] Potential configuration issues:')
  for (const i of issues) {
    console.error(` - ${i.path}: ${i.message}`)
  }

  if (strict) {
    throw new Error(`Invalid environment configuration (${issues.length} issue(s))`)
  }
}

module.exports = { validateEnv }
