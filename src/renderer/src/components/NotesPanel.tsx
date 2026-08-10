import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useNotes } from '@/hooks/useUserData'
import { BOOK_BY_ID } from '@shared/books'
import { PenIcon } from './icons'

export default function NotesPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const bump = useAppStore((s) => s.bumpUserData)
  const { notes } = useNotes(book, chapter)
  const bookName = BOOK_BY_ID[book]?.name ?? book

  const [editing, setEditing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const exportAll = async (): Promise<void> => {
    setExportMsg(null)
    try {
      const path = await window.api.exportMarkdown()
      if (path) setExportMsg(`Saved to ${path}`)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed.')
    }
  }

  const ExportBar = (
    <div className="flex items-center justify-between pb-2 mb-1 border-b border-line/60">
      <span className="text-[11px] uppercase tracking-wider text-faint">Notes</span>
      <button
        onClick={exportAll}
        title="Export all notes & highlights to a Markdown file"
        className="text-[11px] text-muted hover:text-accent"
      >
        Export all…
      </button>
    </div>
  )

  const startEdit = (id: number, body: string): void => {
    setEditing(id)
    setText(body)
  }
  const saveEdit = async (id: number, verse: number): Promise<void> => {
    const body = text.trim()
    if (body) await window.api.saveNote({ id, book, chapter, verse, body })
    else await window.api.deleteNote(id)
    setEditing(null)
    bump()
  }
  const remove = async (id: number): Promise<void> => {
    await window.api.deleteNote(id)
    bump()
  }

  if (notes.length === 0) {
    return (
      <div>
        {ExportBar}
        {exportMsg && <div className="text-[11px] text-muted mb-2">{exportMsg}</div>}
        <div className="mt-8 flex flex-col items-center text-center text-muted">
          <PenIcon className="w-8 h-8 text-faint mb-3" />
          <p className="text-sm max-w-[16rem] leading-relaxed">
            No notes in {bookName} {chapter}. Click a verse number in the text to add one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {ExportBar}
      {exportMsg && <div className="text-[11px] text-muted">{exportMsg}</div>}
      <div className="text-[11px] uppercase tracking-wider text-faint">
        {bookName} {chapter} · {notes.length} note{notes.length > 1 ? 's' : ''}
      </div>
      {notes.map((n) => (
        <div key={n.id} className="rounded-md border border-line bg-elevated p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent tabular-nums">verse {n.verse}</span>
            {editing !== n.id && (
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => startEdit(n.id, n.body)} className="text-muted hover:text-accent">
                  Edit
                </button>
                <button onClick={() => remove(n.id)} className="text-muted hover:text-red-500">
                  Delete
                </button>
              </div>
            )}
          </div>
          {editing === n.id ? (
            <div className="mt-1.5">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-24 resize-none rounded-md border border-line bg-panel p-2 text-sm text-ink outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2 mt-1.5">
                <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs text-muted hover:text-ink">
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit(n.id, n.verse)}
                  className="px-2.5 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed mt-1">{n.body}</p>
          )}
        </div>
      ))}
    </div>
  )
}
