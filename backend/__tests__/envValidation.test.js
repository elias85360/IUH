const { validateEnv } = require('../src/envValidation')

function runWith(env, strict = false) {
  const prev = { ...process.env }
  Object.assign(process.env, env)
  let threw = false
  try { validateEnv({ strict }) } catch { threw = true }
  process.env = prev
  return threw
}

describe('envValidation', () => {
  test('accepts minimal config in non-strict mode', () => {
    const threw = runWith({ NODE_ENV: 'development', DATA_SOURCE: 'mock' }, false)
    expect(threw).toBe(false)
  })

  test('throws in strict mode when required vars missing', () => {
    const threw = runWith({ NODE_ENV: 'production', ENV_STRICT: '1', RBAC_ENFORCE: '1' }, true)
    expect(threw).toBe(true)
  })

  test('rejects unknown DATA_SOURCE', () => {
    const threw = runWith({ DATA_SOURCE: 'foo' }, true)
    expect(threw).toBe(true)
  })

  test('kienlab data source requires base and devices', () => {
    const threw = runWith({ DATA_SOURCE: 'kienlab' }, true)
    expect(threw).toBe(true)
    const ok = runWith({ DATA_SOURCE: 'kienlab', KIENLAB_BASE: 'http://kien', KIENLAB_DEVICES: 'd1' }, true)
    expect(ok).toBe(false)
  })

  test('alerts target requires SMTP host/port', () => {
    const threw = runWith({ ALERTS_TO: 'a@b.c' }, true)
    expect(threw).toBe(true)
    const ok = runWith({ ALERTS_TO: 'a@b.c', SMTP_HOST: 'smtp', SMTP_PORT: '25' }, true)
    expect(ok).toBe(false)
  })

  test('HMAC enforce without keys is reported', () => {
    const threw = runWith({ API_HMAC_ENFORCE: '1' }, true)
    expect(threw).toBe(true)
  })
})
