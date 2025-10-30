// Lightweight PNG export helpers for charts (canvas or SVG)

export function downloadDataUrl(dataUrl, filename='export.png') {
  try {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {}
}

export function exportCanvasToPng(canvas, filename='export.png') {
  if (!canvas) return
  const url = canvas.toDataURL('image/png')
  downloadDataUrl(url, filename)
}

export function exportSvgToPng(svgEl, filename='export.png', width, height, background='#ffffff') {
  if (!svgEl) return
  try {
    const svg = svgEl.cloneNode(true)
    // Ensure proper namespace
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const bbox = svgEl.getBoundingClientRect()
    const w = Math.round(width || bbox.width || 600)
    const h = Math.round(height || bbox.height || 400)
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svg)
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (background) { ctx.fillStyle = background; ctx.fillRect(0,0,w,h) }
        ctx.drawImage(img, 0, 0, w, h)
        const png = canvas.toDataURL('image/png')
        downloadDataUrl(png, filename)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.src = url
  } catch {}
}

export function exportNodeAsPng(node, filename='export.png') {
  if (!node) return
  // Prefer canvas inside node
  const canvas = node.querySelector?.('canvas')
  if (canvas) return exportCanvasToPng(canvas, filename)
  // Else try an SVG root inside node
  const svg = node.querySelector?.('svg')
  if (svg) return exportSvgToPng(svg, filename)
}

