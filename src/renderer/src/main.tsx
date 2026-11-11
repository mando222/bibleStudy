import React from 'react'
import ReactDOM from 'react-dom/client'
import { initializeStudyStorage } from './lib/studyPreferences'
import './styles/globals.css'

async function boot(): Promise<void> {
  // In a plain dev browser (no Electron preload), install a mock API so the UI previews.
  if (import.meta.env.DEV && !(window as unknown as { api?: unknown }).api) {
    const { installDevMock } = await import('./lib/devMock')
    await installDevMock()
  }

  // A second BrowserWindow can load this same renderer in "notebook-only" mode (see main process).
  const detached = new URLSearchParams(window.location.search).get('window')
  await initializeStudyStorage()
  const Root = detached === 'notebook'
    ? (await import('./components/NotebookWindow')).default
    : (await import('./App')).default

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  )
}

void boot()
