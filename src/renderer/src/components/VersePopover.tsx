import { useLayoutEffect, useRef, useState } from 'react'
import { mapPassage } from '@shared/passageMapping'
import type { Highlight, Note } from '@shared/types'
import { BOOK_BY_ID } from '@shared/books'
import { useAppStore } from '@/store/useAppStore'
import { studyStorageKey } from '@/lib/studyPreferences'
import { HIGHLIGHT_COLORS, highlightVar } from '@/lib/highlights'
import { PenIcon, SparkleIcon } from './icons'
import DeleteVerseNote from './DeleteVerseNote'
import { draftNeedsReview, readNoteDraft, type NoteDraft } from '@/lib/noteDraft'
import NoteDraftReview from './NoteDraftReview'

interface Props {
  x: number
  y: number
  translation: string
  book: string
  chapter: number
  verse: number
  verseText: string
  highlight?: Highlight
  note?: Note
  notesLoading?: boolean
  notesError?: string
  retryNotes?: () => void
  onClose: () => void
}

export default function VersePopover({
  x,
  y,
  translation,
  book,
  chapter,
  verse,
  verseText,
  highlight,
  note, notesLoading, notesError, retryNotes,
  onClose
}: Props): JSX.Element {
  const bump = useAppStore((s) => s.bumpUserData)
  const askAssistantAbout = useAppStore((s) => s.askAssistantAbout)
  const inspect = useAppStore(s => s.inspectStudy)
  const draftKey = [studyStorageKey(), 'verse-draft', translation, book, chapter, verse].join(':')
  const [draft, setDraft] = useState(() => readNoteDraft(sessionStorage, draftKey, 'plain'))
  const noteText = draft?.text ?? note?.body ?? ''
  const review = draft && draftNeedsReview(draft, note?.body ?? null)
  function edit(text: string, base: NoteDraft['base']) {
    const next = { text, base }
    setDraft(next)
    sessionStorage.setItem(draftKey, JSON.stringify(next))
  }
  const canonical = mapPassage({ book, chapter, verse }, translation, 'KJV')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const node = dialog.current!
    node.showModal()
    function place() {
      node.style.left = Math.max(8, Math.min(x, window.innerWidth - node.offsetWidth - 8)) + 'px'
      node.style.top = Math.max(8, Math.min(y, window.innerHeight - node.offsetHeight - 8)) + 'px'
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(node)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); node.close() }
  }, [x, y])
  const [editingNote, setEditingNote] = useState(draft !== null)

  const changeHighlight = async (color?: (typeof HIGHLIGHT_COLORS)[number]): Promise<void> => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      if (color) await window.api.saveHighlight({ translation, book, chapter, verse, startToken: null, endToken: null, color })
      else if (highlight) await window.api.deleteHighlight(highlight.id)
      bump()
      if (!draft) onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not change the highlight.')
    } finally { setSaving(false) }
  }

  const saveNote = async (): Promise<void> => {
    const body = noteText.trim()
    if (!body || review || !canonical || notesLoading || notesError || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await window.api.saveNote({ id: note?.id, ...canonical, body })
      sessionStorage.removeItem(draftKey)
      bump()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save this note.')
    } finally { setSaving(false) }
  }

  const deleteNote = async (): Promise<void> => {
    if (!note || notesLoading || notesError || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await window.api.deleteNote(note.id)
      sessionStorage.removeItem(draftKey)
      bump()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not delete this note.')
    } finally { setSaving(false) }
  }

  return (
    <dialog ref={dialog} aria-label={`Verse ${verse} actions`}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-auto m-0 w-64 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-lg border border-line bg-elevated text-ink shadow-xl p-0 backdrop:bg-transparent"
    >
      <div className="p-2">
        <div className="flex items-center gap-1.5 px-1 pb-2">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              disabled={saving}
              onClick={() => void changeHighlight(c)}
              title={c}
              className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                highlight?.color === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-elevated' : 'border-line'
              }`}
              style={{ background: highlightVar(c) }}
            />
          ))}
          <button
            disabled={saving}
            onClick={() => void changeHighlight()}
            title="Remove highlight"
            className="w-6 h-6 rounded-full border border-line text-faint hover:text-accent flex items-center justify-center text-sm"
          >
            ⌀
          </button>
          <button type="button" aria-label="Close verse actions" title="Close verse actions"
            onClick={onClose} className="ms-auto rounded px-1 text-muted hover:text-ink">✕</button>
        </div>

        <div className="border-t border-line pt-2">
          {!canonical ? <p className="text-xs text-muted">No verified reference for shared verse notes.</p>
            : notesError ? <p role="alert" className="text-xs">{notesError} <button onClick={retryNotes}>Try again</button></p>
            : notesLoading && !editingNote ? <p role="status" className="text-xs">Loading notes…</p>
            : editingNote || note ? (
            <div>
              <textarea
                autoFocus
                value={noteText}
                disabled={saving}
                onChange={e => edit(e.target.value, draft ? draft.base : note?.body ?? null)}
                placeholder={`Note on verse ${verse}…`}
                className="w-full h-24 resize-none rounded-md border border-line bg-panel p-2 text-sm text-ink outline-none focus:border-accent"
              />
              {review && note && <NoteDraftReview saved={note.body} review={() => edit(noteText, note.body)} />}
              <div className="flex justify-end gap-2 mt-1.5">
                <button disabled={saving} onClick={() => { sessionStorage.removeItem(draftKey); onClose() }} className="px-2 py-1 text-xs text-muted hover:text-ink">
                  {draft ? 'Discard draft' : 'Cancel'}
                </button>
                <button
                  disabled={saving || notesLoading || !!review || !noteText.trim()}
                  onClick={saveNote}
                  className="px-2.5 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90"
                >
                  Save note
                </button>
              </div>
              {note && <div className="px-1 pt-2 text-xs">
                <DeleteVerseNote key={note.id} disabled={saving || !!notesLoading} onDelete={deleteNote} />
              </div>}
            </div>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="w-full flex items-center gap-2 px-1 py-1.5 text-sm text-muted hover:text-accent rounded-md"
            >
              <PenIcon className="w-4 h-4" />
              Add a note
            </button>
          )}
        </div>

        {saveError && <p role="alert" className="text-xs">{saveError}</p>}
        <div className="border-t border-line pt-2 mt-2">
          <button className="w-full text-left px-1 py-1.5 text-sm text-muted hover:text-accent" onClick={() => {
            inspect({ mode: 'context', range: { edition: translation, book, chapter, firstVerse: verse } }); onClose()
          }}>Passage context</button>
          <button
            onClick={() => {
              askAssistantAbout({
                book, translation,
                bookName: BOOK_BY_ID[book]?.name ?? book,
                chapter,
                verse,
                text: verseText
              })
              onClose()
            }}
            className="w-full flex items-center gap-2 px-1 py-1.5 text-sm text-muted hover:text-accent rounded-md"
          >
            <SparkleIcon className="w-4 h-4" />
            Ask the assistant
          </button>
        </div>
      </div>
    </dialog>
  )
}
