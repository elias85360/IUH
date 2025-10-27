export function computeStats(points) {
  if (!points || !points.length) return { count: 0, min: null, max: null, avg: null, last: null }
  let min=Infinity,max=-Infinity,sum=0
  for (const p of points) { const v=Number(p.value); if (!Number.isFinite(v)) continue; if (v<min) min=v; if (v>max) max=v; sum+=v }
  const last = Number(points[points.length-1].value)
  const count = points.length
  return { count, min, max, avg: sum/count, last }
}

export function rollingZscore(points, window=30) {
  const out = []
  const buf = []
  for (let i=0;i<points.length;i++){
    const v = Number(points[i].value)
    buf.push(v)
    if (buf.length>window) buf.shift()
    const mean = buf.reduce((a,b)=>a+b,0)/buf.length
    const varc = buf.reduce((a,b)=>a+(b-mean)*(b-mean),0)/buf.length
    const std = Math.sqrt(varc)
    const z = std>0 ? (v-mean)/std : 0
    out.push({ ts: points[i].ts, value: v, z })
  }
  return out 
}

export function toCsv(points) {
  const header = 'timestamp,value\n'
  const rows = points.map(p=>`${p.ts},${p.value}`)
  return header + rows.join('\n')
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

