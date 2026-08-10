import { useEffect, useRef, useState } from 'react'
import type { Bookmark, HistoryEntry } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { ClockIcon, BookmarkIcon } from './icons'

/** A TopBar popover: recent chapters + saved bookmarks, and a way to bookmark the current spot. */
export default function HistoryPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const goToVerse = useAppStore((s) => s.goToVerse)
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)

  const bookName = (id: string): string => BOOK_BY_ID[id]?.name ?? id

  const refresh = (): void => {
    window.api.listHistory(30).then(setHistory).catch(() => setHistory([]))
    window.api.listBookmarks().then(setBookmarks).catch(() => setBookmarks([]))
  }

  useEffect(() => {
    if (open) {
      refresh()
      setName(`${bookName(book)} ${chapter}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const addBookmark = async (): Promise<void> => {
    const nm = name.trim() || `${bookName(book)} ${chapter}`
    await window.api.addBookmark({ name: nm, book, chapter, verse: 1 })
    refresh()
  }
  const removeBookmark = async (id: number): Promise<void> => {
    await window.api.deleteBookmark(id)
    refresh()
  }
  const go = (b: string, c: number, v: number | null): void => {
    goToVerse(b, c, v ?? 1)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-md hover:bg-elevated text-muted"
        title="History & bookmarks"
      >
        <ClockIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-panel shadow-2xl z-50 p-2 text-sm">
          <div className="flex gap-1.5 mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bookmark name"
              className="flex-1 min-w-0 bg-elevated border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            />
            <button
              onClick={addBookmark}
              className="px-2 py-1 rounded-md bg-accent text-white text-xs hover:opacity-90 whitespace-nowrap"
            >
              Bookmark
            </button>
          </div>

          {bookmarks.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-faint px-1 mb-1">Bookmarks</div>
              <ul className="mb-2">
                {bookmarks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 group">
                    <button
                      onClick={() => go(b.book, b.chapter, b.verse)}
                      className="flex-1 min-w-0 text-left px-1.5 py-1 rounded hover:bg-elevated flex items-center gap-1.5"
                    >
                      <BookmarkIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate text-ink">{b.name}</span>
                      <span className="text-[11px] text-faint whitespace-nowrap">
                        {bookName(b.book)} {b.chapter}
                      </span>
                    </button>
                    <button
                      onClick={() => removeBookmark(b.id)}
                      className="text-[11px] text-faint hover:text-red-500 opacity-0 group-hover:opacity-100 px-1"
                      title="Remove bookmark"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="text-[11px] uppercase tracking-wider text-faint px-1 mb-1">Recent</div>
          {history.length ? (
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => go(h.book, h.chapter, h.verse)}
                    className="w-full text-left px-1.5 py-1 rounded hover:bg-elevated text-ink"
                  >
                    {bookName(h.book)} {h.chapter}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint px-1 py-1">Chapters you read will appear here.</p>
          )}
        </div>
      )}
    </div>
  )
}
