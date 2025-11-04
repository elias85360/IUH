import { useUiStore } from '../src/state/filters.js'

export default function Pagination({ total }) {
  const { page, setPage, pageSize } = useUiStore()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="toolbar" style={{justifyContent:'flex-end'}}>
      <button className="btn" onClick={()=>setPage(1)} disabled={page===1}>{'<<'}</button>
      <button className="btn" onClick={()=>setPage(page-1)} disabled={page===1}>{'<'}</button>
      <span className="badge">Page {page}/{totalPages}</span>
      <button className="btn" onClick={()=>setPage(page+1)} disabled={page===totalPages}>{'>'}</button>
      <button className="btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>{'>>'}</button>
    </div> 
  )
}

