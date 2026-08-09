import { useState } from 'react'
import type { Highlight, Note } from '@shared/types'
import { BOOK_BY_ID } from '@shared/books'
import { useAppStore } from '@/store/useAppStore'
import { HIGHLIGHT_COLORS, highlightVar } from '@/lib/highlights'
import { PenIcon, SparkleIcon } from './icons'

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
  note,
  onClose
}: Props): JSX.Element {
  const bump = useAppStore((s) => s.bumpUserData)
  const askAssistantAbout = useAppStore((s) => s.askAssistantAbout)
  const [noteText, setNoteText] = useState(note?.body ?? '')
  const [editingNote, setEditingNote] = useState(false)

  const setColor = async (color: (typeof HIGHLIGHT_COLORS)[number]): Promise<void> => {
    await window.api.saveHighlight({
      translation,
      book,
      chapter,
      verse,
      startToken: null,
      endToken: null,
      color
    })
    bump()
    onClose()
  }

  const clearColor = async (): Promise<void> => {
    if (highlight) {
      await window.api.deleteHighlight(highlight.id)
      bump()
    }
    onClose()
  }

  const saveNote = async (): Promise<void> => {
    const body = noteText.trim()
    if (!body && note) await window.api.deleteNote(note.id)
    else if (body) await window.api.saveNote({ id: note?.id, book, chapter, verse, body })
    bump()
    onClose()
  }

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className="absolute z-20 w-64 rounded-lg border border-line bg-elevated shadow-xl p-2"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 px-1 pb-2">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                highlight?.color === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-elevated' : 'border-line'
              }`}
              style={{ background: highlightVar(c) }}
            />
          ))}
          <button
            onClick={clearColor}
            title="Remove highlight"
            className="w-6 h-6 rounded-full border border-line text-faint hover:text-accent flex items-center justify-center text-sm"
          >
            ⌀
          </button>
        </div>

        <div className="border-t border-line pt-2">
          {editingNote || note ? (
            <div>
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={`Note on verse ${verse}…`}
                className="w-full h-24 resize-none rounded-md border border-line bg-panel p-2 text-sm text-ink outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2 mt-1.5">
                <button onClick={onClose} className="px-2 py-1 text-xs text-muted hover:text-ink">
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  className="px-2.5 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90"
                >
                  Save note
                </button>
              </div>
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

        <div className="border-t border-line pt-2 mt-2">
          <button
            onClick={() => {
              askAssistantAbout({
                book,
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
    </>
  )
}
