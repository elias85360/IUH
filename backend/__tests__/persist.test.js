const fs = require('fs')
const os = require('os')
const path = require('path')

describe('persist helpers', () => {
  let tmp
  let origCwd
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'))
    origCwd = process.cwd()
    process.chdir(tmp)
  })

  afterEach(() => {
    process.chdir(origCwd)
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  })

  test('saveJSON then loadJSON roundtrip', () => {
    jest.resetModules()
    const { saveJSON, loadJSON } = require('../src/persist')
    const ok = saveJSON('file.json', { a: 1, b: 'x' })
    expect(ok).toBe(true)
    const loaded = loadJSON('file.json', {})
    expect(loaded).toEqual({ a: 1, b: 'x' })
  })

  test('loadJSON returns default when missing or invalid', () => {
    jest.resetModules()
    const { loadJSON } = require('../src/persist')
    expect(loadJSON('absent.json', { def: 1 })).toEqual({ def: 1 })
    const p = path.resolve(process.cwd(), 'backend', 'data', 'bad.json')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, 'not json', 'utf8')
    expect(loadJSON('bad.json', { fallback: true })).toEqual({ fallback: true })
  })

  test('saveJSON returns false when write fails', () => {
    jest.resetModules()
    const fs = require('fs')
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full') })
    const { saveJSON } = require('../src/persist')
    const ok = saveJSON('fail.json', { a: 1 })
    expect(ok).toBe(false)
    spy.mockRestore()
  })
})
