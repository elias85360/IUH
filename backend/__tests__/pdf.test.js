describe('pdf helpers', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('hasPdf returns false when pdfkit missing', () => {
    jest.isolateModules(() => {
      jest.doMock('pdfkit', () => { throw new Error('no pdf') })
      const pdf = require('../src/pdf')
      expect(pdf.hasPdf()).toBe(false)
    })
  })

  test('buildKpiPdf returns buffer when pdfkit available', async () => {
    const listeners = {}
    jest.isolateModules(() => {
      class FakePdf {
        constructor() { this.listeners = {} }
        on(ev, cb) { this.listeners[ev] = cb }
        fontSize() { return this }
        text() { return this }
        moveDown() { return this }
        end() {
          if (this.listeners['data']) this.listeners['data'](Buffer.from('chunk'))
          if (this.listeners['end']) this.listeners['end']()
        }
      }
      jest.doMock('pdfkit', () => FakePdf)
      const pdf = require('../src/pdf')
      expect(pdf.hasPdf()).toBe(true)
      return pdf.buildKpiPdf({ title: 't', device: 'd1', kpis: { P: { last: 1, min: 1, max: 1, avg: 1 } } }).then((buf) => {
        expect(Buffer.isBuffer(buf)).toBe(true)
        expect(buf.length).toBeGreaterThan(0)
      })
    })
  })
})
