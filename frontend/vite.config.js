import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_TARGET = env.VITE_API_PROXY_TARGET || 'http://localhost:4001'
  const KIENLAB_TARGET = env.VITE_MASTER_PROXY_TARGET || 'http://eprophet.kienlab.com'
  const DEV_HTTPS = env.VITE_DEV_HTTPS === '1'

  const ALLOW = (env.VITE_CSP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  const connectSrc = ["'self'", 'http:', 'https:', 'ws:', 'wss:', ...ALLOW].join(' ')
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `connect-src ${connectSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
  ].join('; ')

  return defineConfig({
    plugins: [react()],
    server: {
      host: true,  // <-- permet l'accès depuis d'autre appareils
      port: 5174,
      strictPort: true,
      https: DEV_HTTPS,
      headers: {
        'Content-Security-Policy': csp,
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
      proxy: {
        '/api/master': { target: API_TARGET, changeOrigin: true, secure: false },
        '/api':        { target: API_TARGET, changeOrigin: true, secure: false },
        '/metrics':    { target: API_TARGET, changeOrigin: true, secure: false },
        '/kienlab': {
          target: KIENLAB_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/kienlab/, ''),
        },
      },
    },
  })
}
