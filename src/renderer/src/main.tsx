import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

async function boot(): Promise<void> {
  // In a plain dev browser (no Electron preload), install a mock API so the UI previews.
  if (import.meta.env.DEV && !(window as unknown as { api?: unknown }).api) {
    const { installDevMock } = await import('./lib/devMock')
    await installDevMock()
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void boot()
