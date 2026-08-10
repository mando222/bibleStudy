import { useAppStore } from '@/store/useAppStore'
import { NotebookIcon } from './icons'
import NotebookPanel from './NotebookPanel'

/** The slide-in notebook drawer. "Pop out" detaches it into its own movable window (same app). */
export default function NotebookDrawer(): JSX.Element {
  const open = useAppStore((s) => s.notebookOpen)
  const setOpen = useAppStore((s) => s.setNotebookOpen)

  const popOut = (): void => {
    window.notebook?.openWindow?.().catch(() => undefined)
    setOpen(false)
  }

  return (
    <div
      className={`fixed inset-y-0 right-0 z-40 w-[440px] max-w-[92vw] bg-panel border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-12 shrink-0 border-b border-line flex items-center gap-2 px-3">
        <NotebookIcon className="w-4 h-4 text-accent" />
        <span className="font-semibold text-sm text-ink">Notebook</span>
        <div className="flex-1" />
        <button
          onClick={popOut}
          title="Open the notebook in its own window"
          className="text-[11px] text-muted hover:text-accent"
        >
          ⧉ Pop out
        </button>
        <button
          onClick={() => setOpen(false)}
          className="w-7 h-7 rounded-md text-muted hover:bg-elevated hover:text-ink"
        >
          ✕
        </button>
      </div>

      <NotebookPanel visible={open} />
    </div>
  )
}
