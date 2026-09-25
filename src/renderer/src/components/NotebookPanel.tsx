import { useEffect, useMemo, useState } from 'react'
import type { NotebookFile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { SparkleIcon } from './icons'
import { useNotebookDocument } from '@/hooks/useNotebookDocument'

/**
 * The notebook editor: a file picker + Markdown editor + "ask AI to edit" proposal flow. Rendered
 * both inside the slide-in drawer and inside the detachable notebook window, so the logic lives here
 * once. Notes are plain `.md` files on disk (shared via IPC), so both surfaces edit the same data.
 */
export default function NotebookPanel({ visible = true }: { visible?: boolean }): JSX.Element {
  const active = useAppStore((s) => s.activeNotebookFile)
  const setActive = useAppStore((s) => s.setActiveNotebookFile)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const activeVerse = useAppStore((s) => s.activeVerse)

  const [files, setFiles] = useState<NotebookFile[]>([])
  const { content, edit, flush, ready, status, error } = useNotebookDocument(active, visible)
  const [folder, setFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const [instruction, setInstruction] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [proposal, setProposal] = useState<string | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const refreshFiles = (): void => {
    window.notebook
      ?.list()
      .then(setFiles)
      .catch(() => setFiles([]))
  }

  // Load the folder + file list when the panel becomes visible.
  useEffect(() => {
    if (!visible) return
    window.notebook?.getFolder().then(setFolder).catch(() => undefined)
    refreshFiles()
  }, [visible])

  // AI proposals are tied to the note that requested them.
  useEffect(() => {
    setProposal(null)
    setAiErr(null)
    setInstruction('')
  }, [active])

  const runFileAction = async (action: () => Promise<void>): Promise<void> => {
    if (busy || aiBusy) return
    setBusy(true)
    setFileError(null)
    try {
      await flush()
      await action()
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not update the notebook.')
    } finally {
      setBusy(false)
    }
  }

  const selectFile = (name: string | null): void => {
    void runFileAction(async () => { setActive(name) })
  }

  const createFile = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    const f = await window.notebook.create(name)
    setCreating(false)
    setNewName('')
    refreshFiles()
    setActive(f.name)
  }

  const deleteFile = async (): Promise<void> => {
    if (!active) return
    await window.notebook.delete(active)
    setActive(null)
    refreshFiles()
  }

  const changeFolder = async (): Promise<void> => {
    const dir = await window.notebook.chooseFolder()
    if (dir === folder) return
    setFolder(dir)
    setActive(null)
    refreshFiles()
  }

  const contextLine = useMemo(() => {
    const name = BOOK_BY_ID[book]?.name ?? book
    return `Open passage: ${name} ${chapter}${activeVerse ? `:${activeVerse}` : ''}`
  }, [book, chapter, activeVerse])

  const askAi = async (): Promise<void> => {
    const q = instruction.trim()
    if (!q || aiBusy || !window.ai) return
    setAiBusy(true)
    setAiErr(null)
    setProposal(null)
    try {
      const res = await window.ai.complete(
        [
          {
            role: 'user',
            content: `${q}\n\nHere is my current note (Markdown). Return only the revised note text.\n\n---\n${content}`
          }
        ],
        null,
        contextLine
      )
      if (res.error) setAiErr(res.error)
      setProposal(res.text || '(no output)')
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-line px-2 py-1 flex items-center gap-2 text-[11px] text-muted">
        <span className="truncate" title={folder}>
          {folder || 'Notebook folder'}
        </span>
        <div className="flex-1" />
        <button disabled={busy || aiBusy} onClick={() => void runFileAction(changeFolder)} className="hover:text-accent whitespace-nowrap disabled:opacity-50">
          Change…
        </button>
      </div>

      <div className="shrink-0 border-b border-line p-2 flex items-center gap-1.5">
        <select
          value={active ?? ''}
          aria-label="Notebook file"
          disabled={busy || aiBusy}
          onChange={(e) => selectFile(e.target.value || null)}
          className="flex-1 min-w-0 bg-elevated border border-line rounded-md px-2 py-1 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">{files.length ? 'Select a note…' : 'No notes yet'}</option>
          {files.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setCreating((c) => !c)}
          className="px-2 py-1 rounded-md border border-line text-sm text-muted hover:bg-elevated"
        >
          New
        </button>
        {active && (
          <button
            disabled={busy || aiBusy}
            onClick={() => void runFileAction(deleteFile)}
            className="px-2 py-1 rounded-md border border-line text-sm text-muted hover:text-red-500"
          >
            Delete
          </button>
        )}
      </div>

      {creating && (
        <div className="shrink-0 border-b border-line p-2 flex gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runFileAction(createFile)}
            aria-label="New note name"
            placeholder="Note name (.md)"
            className="flex-1 min-w-0 bg-elevated border border-line rounded-md px-2 py-1 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            disabled={busy || aiBusy || !newName.trim()}
            onClick={() => void runFileAction(createFile)}
            className="px-2.5 py-1 rounded-md bg-accent text-white text-sm hover:opacity-90"
          >
            Create
          </button>
        </div>
      )}

      {(error || fileError) && (
        <div role="alert" className="p-2 text-sm text-red-500">
          {fileError || error}
          {error && ready && <button onClick={() => void runFileAction(async () => {})} className="ml-2 underline">Retry save</button>}
        </div>
      )}

      {active ? (
        <>
          <textarea
            value={content}
            aria-label="Note content"
            disabled={!ready || busy}
            onChange={(e) => edit(e.target.value)}
            placeholder={ready ? 'Write in Markdown…' : 'Loading note…'}
            className="flex-1 min-h-0 resize-none w-full bg-bg p-3 text-sm text-ink leading-relaxed outline-none font-mono"
          />
          <div role="status" className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-faint">
            {status} · {active}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center text-muted p-6">
          <p className="text-sm max-w-[16rem] leading-relaxed">
            Select a note, or create one. Notes are saved as Markdown files in your notebook folder.
          </p>
        </div>
      )}

      {active && ready && (
        <div className="shrink-0 border-t border-line p-2 space-y-2">
          <div className="flex gap-1.5">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askAi()}
              placeholder="Ask the AI to edit this note…"
              className="flex-1 min-w-0 bg-elevated border border-line rounded-md px-2 py-1 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              onClick={askAi}
              disabled={aiBusy || busy || !instruction.trim()}
              className="px-2.5 py-1 rounded-md border border-accent/40 text-accent text-sm hover:bg-accent-soft disabled:opacity-50 flex items-center gap-1"
            >
              <SparkleIcon className="w-3.5 h-3.5" />
              {aiBusy ? '…' : 'Ask'}
            </button>
          </div>
          {aiErr && <div className="text-[11px] text-red-500">{aiErr}</div>}
          {proposal != null && (
            <div className="rounded-md border border-line bg-elevated p-2">
              <div className="text-[11px] uppercase tracking-wider text-faint mb-1">AI proposal</div>
              <pre className="text-xs text-ink whitespace-pre-wrap max-h-40 overflow-y-auto">
                {proposal}
              </pre>
              <div className="flex justify-end gap-2 mt-1.5 text-xs">
                <button onClick={() => setProposal(null)} className="px-2 py-1 text-muted hover:text-ink">
                  Dismiss
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(proposal)}
                  className="px-2 py-1 text-muted hover:text-ink"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    edit(`${content}\n\n${proposal}`)
                    setProposal(null)
                  }}
                  className="px-2 py-1 rounded-md border border-line text-muted hover:bg-panel"
                >
                  Insert
                </button>
                <button
                  onClick={() => {
                    edit(proposal)
                    setProposal(null)
                  }}
                  className="px-2.5 py-1 rounded-md bg-accent text-white hover:opacity-90"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
