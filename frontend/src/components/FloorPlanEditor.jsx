import { useEffect, useMemo, useRef, useState } from 'react'

export default function FloorPlanEditor({ devices = [], meta = {}, setMeta }) {
  const [imgSrc, setImgSrc] = useState(() => { try { return localStorage.getItem('floorplan:image') || '' } catch { return '' } })
  const [selectedId, setSelectedId] = useState('')
  const containerRef = useRef(null)

  function onUpload(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result
      setImgSrc(String(data))
      try { localStorage.setItem('floorplan:image', String(data)) } catch {}
    }
    reader.readAsDataURL(f)
  }

  function clearImage() {
    setImgSrc('')
    try { localStorage.removeItem('floorplan:image') } catch {}
  }

  function onClickPlan(e) {
    if (!selectedId) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMeta(selectedId, { pos: { xPct: Number(x.toFixed(2)), yPct: Number(y.toFixed(2)) } })
  }

  const placed = useMemo(()=> devices.filter(d => meta[d.id]?.pos), [devices, meta])
  const unplaced = useMemo(()=> devices.filter(d => !meta[d.id]?.pos), [devices, meta])

  return (
    <div>
      <div className="row" style={{gap:8, marginBottom:12, flexWrap:'wrap'}}>
        <label className="btn" style={{display:'inline-flex', alignItems:'center', gap:8}}>
          Upload plan (SVG/PNG)
          <input type="file" accept="image/svg+xml,image/png,image/jpeg" style={{display:'none'}} onChange={onUpload} />
        </label>
        {imgSrc && <button className="btn" onClick={clearImage}>Remove plan</button>}
        <select className="select" value={selectedId} onChange={(e)=>setSelectedId(e.target.value)}>
          <option value="">(select device to place)</option>
          {unplaced.map(d => <option key={d.id} value={d.id}>{meta[d.id]?.name || d.name || d.id}</option>)}
          {placed.length>0 && <option disabled>— placed —</option>}
          {placed.map(d => <option key={d.id} value={d.id}>{meta[d.id]?.name || d.name || d.id}</option>)}
        </select>
        {selectedId && <span className="badge">Click on the plan to set position</span>}
      </div>
      <div ref={containerRef} onClick={onClickPlan} style={{position:'relative', width:'100%', height: imgSrc? 520 : 140, border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, overflow:'hidden', background: imgSrc? 'transparent' : 'rgba(255,255,255,0.04)'}}>
        {imgSrc ? <img src={imgSrc} alt="floor" style={{width:'100%', height:'100%', objectFit:'contain'}} /> : <div className="row" style={{justifyContent:'center', height:'100%'}}><span className="badge">No plan uploaded</span></div> }
        {imgSrc && devices.map(d => {
          const p = meta[d.id]?.pos
          if (!p) return null
          const label = meta[d.id]?.name || d.name || d.id
          return (
            <button key={d.id} title={label} onClick={(e)=>{ e.stopPropagation(); window.location.href = `/devices/${encodeURIComponent(d.id)}` }}
              className="btn" style={{position:'absolute', left: `${p.xPct}%`, top: `${p.yPct}%`, transform:'translate(-50%, -50%)', padding:'6px 8px'}}>
              •
            </button>
          )
        })}
      </div>
    </div>
  )
}

