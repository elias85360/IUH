import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, AuthRefreshBootstrap } from './components/AuthProvider.jsx'
import App from './App.jsx'

// Styles globaux
import './styles.css'

//Setup Chart.js (axes, grilles, tooltips)
import './lib/chartjs-setup.js'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthRefreshBootstrap />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
