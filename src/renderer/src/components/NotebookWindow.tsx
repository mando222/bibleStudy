import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { NotebookIcon } from './icons'
import NotebookPanel from './NotebookPanel'

/** The detached notebook — its own OS window (same app), loaded when the renderer runs in
 *  `?window=notebook` mode. Reuses NotebookPanel, so it edits the same files as the drawer. */
export default function NotebookWindow(): JSX.Element {
  const theme = useAppStore((s) => s.theme)

  // This window doesn't mount <App/>, so apply the light/dark class here.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="h-full flex flex-col bg-panel text-ink">
      <div className="h-11 shrink-0 border-b border-line flex items-center gap-2 px-3">
        <NotebookIcon className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm text-ink">Notebook</span>
      </div>
      <NotebookPanel />
    </div>
  )
}
