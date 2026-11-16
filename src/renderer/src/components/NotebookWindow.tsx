import { useTheme } from '@/hooks/useTheme'
import { NotebookIcon } from './icons'
import NotebookPanel from './NotebookPanel'

/** The detached notebook — its own OS window (same app), loaded when the renderer runs in
 *  `?window=notebook` mode. Reuses NotebookPanel, so it edits the same files as the drawer. */
export default function NotebookWindow(): JSX.Element {
  useTheme()

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
