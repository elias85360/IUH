// Centralized Chart.js registration. Import this once at app entry
// if/when Chart.js charts are used.
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  CategoryScale,
  PointElement,
  LineElement,
  ScatterController,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

let registered = false
export function registerBaseCharts() {
  if (registered) return
  ChartJS.register(
    TimeScale,
    LinearScale,
    CategoryScale,
    PointElement,
    LineElement,
    ScatterController,
    BarElement,
    ArcElement,
    RadialLinearScale,
    Tooltip,
    Legend,
  )
  registered = true
}

// Optional on‑demand plugins
export async function registerZoom() {
  const { default: Zoom } = await import('chartjs-plugin-zoom')
  ChartJS.register(Zoom)
}
export async function registerAnnotation() {
  const { default: Annotation } = await import('chartjs-plugin-annotation')
  ChartJS.register(Annotation)
}

export async function registerMatrix() {
  // Explicitly register Matrix controller/element
  const mod = await import('chartjs-chart-matrix')
  const { MatrixController, MatrixElement } = mod
  try { ChartJS.register(MatrixController, MatrixElement) } catch {}
}
