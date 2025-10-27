export default function AnomaliesList({ anomalies = [] }) {
  if (!anomalies.length) return (
    <div className="panel"><div className="panel-title">Anomalies</div><div className="badge">No anomalies</div></div>
  )
  const top = anomalies
    .slice()
    .sort((a,b)=>Math.abs(b.z)-Math.abs(a.z))
    .slice(0,10)
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Anomalies</div>
        <div className="badge">{anomalies.length}</div>
      </div>
      <div style={{maxHeight:180, overflowY:'auto'}}>
        {top.map((a,i)=> (
          <div key={i} className="row" style={{justifyContent:'space-between'}}>
            <div>{new Date(a.ts).toLocaleString()}</div>
            <div><strong>{a.value.toFixed(2)}</strong></div>
            <div className="badge" style={{borderColor:'#ef4444', color:'#ef4444'}}>z={a.z.toFixed(2)}</div>
          </div>
        ))}
      </div> 
    </div>
  )
}

