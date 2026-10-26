import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './lib/auth'
import { CompareProvider } from './lib/compare'
import { isConfigured } from './lib/supabase'
import './index.css'

function ConfigError() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="max-w-lg bg-white border border-steel-300 p-6 space-y-3">
        <h1 className="text-xl font-bold">Setup needed</h1>
        <p>The app cannot reach its database because the Supabase settings are missing or wrong.</p>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>In Vercel, open Settings, Environment Variables.</li>
          <li>Set <code>VITE_SUPABASE_URL</code>. It must start with https:// (for example https://abcd1234.supabase.co).</li>
          <li>Set <code>VITE_SUPABASE_ANON_KEY</code> to the anon public key. No quotes, no spaces.</li>
          <li>Redeploy. Changes only apply to new deployments.</li>
        </ol>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isConfigured ? (
        <BrowserRouter>
          <AuthProvider>
            <CompareProvider>
              <App />
            </CompareProvider>
          </AuthProvider>
        </BrowserRouter>
      ) : (
        <ConfigError />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
