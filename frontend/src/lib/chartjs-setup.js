// Centralized Chart.js registration + LIGHT THEME.
// Import this once at app entry (main.jsx)
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

// Optional on-demand plugins
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

/* ===== LIGHT THEME (appliqué globalement) ===== */
function applyLightCardTheme() {
  registerBaseCharts()

  // Base
  ChartJS.defaults.responsive = true
  ChartJS.defaults.maintainAspectRatio = false
  ChartJS.defaults.color = '#334155'              // texte
  ChartJS.defaults.borderColor = '#e5e7eb'        // bordures/axes
  ChartJS.defaults.font.family = 'Inter, system-ui, Segoe UI, Roboto, Arial'
  ChartJS.defaults.font.size = 12

  // Scales
  const grid = '#e5e7eb'
  const tick = '#64748b'
  const title = '#0f172a'
  const applyScale = (key) => {
    ChartJS.defaults.scales[key] = {
      ...(ChartJS.defaults.scales[key] || {}),
      grid: { color: grid, drawBorder: false },
      ticks: { color: tick },
      title: { color: title, font: { weight: '700' } }
    }
  }
  ;['category','linear','time','timeseries'].forEach(applyScale)

  // Éléments
  ChartJS.defaults.elements.line = { tension: .35, borderWidth: 2, fill: false }
  ChartJS.defaults.elements.bar = { borderRadius: 6 }

  // Plugins
  ChartJS.defaults.plugins.legend = {
    ...ChartJS.defaults.plugins.legend,
    position: 'bottom',
    labels: { color: '#334155', boxWidth: 10, usePointStyle: true }
  }
  ChartJS.defaults.plugins.title = {
    ...ChartJS.defaults.plugins.title,
    color: '#0f172a', font: { weight: '700', size: 14 }
  }
  ChartJS.defaults.plugins.tooltip = {
    cornerRadius: 8,
    backgroundColor: '#0f172a',
    titleColor: '#fff',
    bodyColor: '#e5e7eb',
    borderColor: '#0b2145',
    borderWidth: 1
  }
}

// Appliquer immédiatement à l'import
applyLightCardTheme()

// Optionnel : ré-appliquer si nécessaire
export function applyChartTheme(){ applyLightCardTheme() }
