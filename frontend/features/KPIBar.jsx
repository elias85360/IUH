export default function KPIBar({ devices }) {
  return (
    <div className="card lg">
      <h3>KPIs globaux</h3>
      <div className="kpi">
        <div className="item">Devices: <strong>{devices.length}</strong></div>
        <div className="item">Filtres actifs: <strong>Oui</strong></div>
        <div className="item">Période: <strong>variable</strong></div>
      </div>
    </div>
  )
}

 