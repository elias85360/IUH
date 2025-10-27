// Lightweight PDF export using pdfkit if available.
// If pdfkit is not installed, export will return 501.

let PDFDocument = null
try { PDFDocument = require('pdfkit') } catch { PDFDocument = null }

function hasPdf() { return !!PDFDocument }

function buildKpiPdf({ title = 'IoT Report', device, kpis = {}, from, to }) {
  if (!PDFDocument) throw new Error('pdfkit not installed')
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  doc.on('end', () => {})
  doc.fontSize(18).text(title)
  doc.moveDown().fontSize(12)
  doc.text(`Device: ${device}`)
  if (from) doc.text(`From: ${new Date(Number(from)).toISOString()}`)
  if (to) doc.text(`To:   ${new Date(Number(to)).toISOString()}`)
  doc.moveDown()
  doc.text('KPIs:', { underline: true })
  for (const [mk, v] of Object.entries(kpis)) {
    const line = `${mk}  last=${fmt(v.last)}  min=${fmt(v.min)}  max=${fmt(v.max)}  avg=${fmt(v.avg)}`
    doc.text(line)
  }
  doc.end()
  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function fmt(x) { return x == null ? '—' : String(Math.round(Number(x) * 100) / 100) }

module.exports = { hasPdf, buildKpiPdf }

