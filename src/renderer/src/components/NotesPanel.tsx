import { useState } from 'react'
import { readingEdition, useAppStore } from '@/store/useAppStore'
import { mapPassage } from '@shared/passageMapping'
import type { Note } from '@shared/types'
import { useNotes } from '@/hooks/useUserData'
import { BOOK_BY_ID } from '@shared/books'
import { PenIcon } from './icons'
import { readerChapter } from '@/lib/passage'
import { studyStorageKey } from '@/lib/studyPreferences'
import AllAnnotations from './AllAnnotations'
import { draftNeedsReview, readNoteDraft, type NoteDraft } from '@/lib/noteDraft'
import NoteDraftReview from './NoteDraftReview'

export default function NotesPanel({ initialScope = 'chapter', onNavigate }: { initialScope?: 'chapter' | 'all'; onNavigate?: () => void }) {
  const [scope, setScope] = useState(initialScope)
  const sourceBook = useAppStore(s => s.book)
  const sourceChapter = useAppStore(s => s.chapter)
  const sourceEdition = useAppStore(s => s.referenceEdition || s.primary)
  const verse = useAppStore(s => s.activeVerse)
  const edition = useAppStore(s => !s.interlinear && s.parallels.includes(s.referenceEdition) ? s.referenceEdition : readingEdition(s))
  const native = readerChapter(sourceBook, sourceChapter, verse, sourceEdition, edition)
  const book = native?.book ?? sourceBook
  const chapter = native?.chapter ?? sourceChapter
  return <div>
    <div className="flex flex-wrap gap-2 mb-3">
      {(['chapter', 'all'] as const).map(value => <button key={value} aria-pressed={scope === value}
        onClick={() => setScope(value)} className={'rounded border px-2 py-1 text-xs ' + (scope === value ? 'border-accent text-accent' : 'border-line text-muted')}>
        {value === 'all' ? 'All notes & highlights' : (BOOK_BY_ID[book]?.name ?? book) + ' ' + chapter + ' · ' + edition}
      </button>)}
    </div>
    {scope === 'all' ? <AllAnnotations onNavigate={onNavigate} /> :
      native || edition.startsWith('imp_') ? <ChapterNotes key={[book, chapter, edition].join(':')} book={book} chapter={chapter} edition={edition} /> :
        <p className="text-sm text-muted">No verified passage correspondence for this chapter in {edition}.</p>}
  </div>
}

function ChapterNotes({book, chapter, edition}: {book: string; chapter: number; edition: string}): JSX.Element {
  const bump = useAppStore(s => s.bumpUserData)
  const { notes, loading, error, retry } = useNotes(book, chapter, edition)
  const bookName = BOOK_BY_ID[book]?.name ?? book

  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<NoteDraft>({ text: '' })
  const text = draft.text
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [writeError, setWriteError] = useState('')
  const [writing, setWriting] = useState(false)
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

  const draftKey = (id: number) => `${studyStorageKey()}:chapter-note-draft:${id}`
  const startEdit = (id: number, body: string): void => {
    setPendingDelete(null)
    setWriteError('')
    setEditing(id)
    setDraft(readNoteDraft(sessionStorage, draftKey(id), 'plain') ?? { base: body, text: body })
  }
  const changeText = (note: Note, value: string, base = draft.base): void => {
    const next = { base, text: value }
    setDraft(next)
    if (value === note.body) sessionStorage.removeItem(draftKey(note.id))
    else sessionStorage.setItem(draftKey(note.id), JSON.stringify(next))
    setPendingDelete(null)
  }
  const saveEdit = async (note: Note): Promise<void> => {
    if (draftNeedsReview(draft, note.body)) return
    const { id, book, chapter, verse } = note
    const body = text.trim()
    if (!body) { setPendingDelete(id); return }
    setWriting(true)
    setWriteError('')
    try {
      await window.api.saveNote({ id, book, chapter, verse, body })
      if (readNoteDraft(sessionStorage, draftKey(id), 'plain')?.text === text) sessionStorage.removeItem(draftKey(id))
      setEditing(null)
      bump()
    } catch {
      setWriteError('Could not save this note. Your draft is still open.')
    } finally { setWriting(false) }
  }
  const remove = async (id: number): Promise<void> => {
    setWriting(true)
    setWriteError('')
    try {
      await window.api.deleteNote(id)
      sessionStorage.removeItem(draftKey(id))
      setPendingDelete(null)
      setEditing(null)
      bump()
    } catch {
      setWriteError('Could not delete this note.')
    } finally { setWriting(false) }
  }

  if (error) return <div>{ExportBar}<p role="alert">{error} <button onClick={retry}>Try again</button></p></div>
  if (loading) return <p role="status">Loading notes…</p>
  if (notes.length === 0) {
    return (
      <div>
        {ExportBar}
        {exportMsg && <div className="text-[11px] text-muted mb-2">{exportMsg}</div>}
        <div className="mt-8 flex flex-col items-center text-center text-muted">
          <PenIcon className="w-8 h-8 text-faint mb-3" />
          <p className="text-sm max-w-[16rem] leading-relaxed">
            {edition.startsWith('imp_')
              ? 'Shared notes require verified verse numbering. You can highlight passages in this imported edition.'
              : `No notes in ${bookName} ${chapter}. Select a verse to add one.`}
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
      {writeError && <p role="alert">{writeError}</p>}
      {notes.map((n) => (
        <div key={n.id} className="rounded-md border border-line bg-elevated p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent tabular-nums">verse {mapPassage(n, 'KJV', edition)?.verse ?? n.verse}</span>
            {editing !== n.id && (
              <div className="flex gap-2 text-[11px]">
                <button disabled={writing} onClick={() => startEdit(n.id, n.body)} className="text-muted hover:text-accent">
                  {sessionStorage.getItem(draftKey(n.id)) === null ? 'Edit' : 'Resume draft'}
                </button>
                <button onClick={() => setPendingDelete(n.id)} className="text-muted hover:text-red-500">
                  Delete
                </button>
              </div>
            )}
          </div>
          {pendingDelete === n.id && <div role="group" aria-label="Confirm deletion" className="text-sm py-2">
            Delete this verse note?
            <button className="mx-2 text-accent" disabled={writing} onClick={() => setPendingDelete(null)}>Keep note</button>
            <button disabled={writing} onClick={() => remove(n.id)}>Confirm delete</button>
          </div>}
          {editing === n.id ? (
            <div className="mt-1.5">
              <textarea
                autoFocus disabled={writing}
                value={text}
                onChange={(e) => changeText(n, e.target.value)}
                className="w-full h-24 resize-none rounded-md border border-line bg-panel p-2 text-sm text-ink outline-none focus:border-accent"
              />
              {draftNeedsReview(draft, n.body) && <NoteDraftReview saved={n.body} review={() => changeText(n, text, n.body)} />}
              <div className="flex justify-end gap-2 mt-1.5">
                <button disabled={writing} onClick={() => { sessionStorage.removeItem(draftKey(n.id)); setPendingDelete(null); setEditing(null) }} className="px-2 py-1 text-xs text-muted hover:text-ink">
                  {text === n.body ? 'Cancel' : 'Discard draft'}
                </button>
                <button
                  disabled={writing || draftNeedsReview(draft, n.body)} onClick={() => saveEdit(n)}
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
