import { useEffect, useState } from 'react'
import type { CrossRef } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { LinkIcon } from './icons'
import VerseRefs from './VerseRefs'

/**
 * Cross-references (Treasury of Scripture Knowledge) for the currently-selected verse.
 * The verse is set by clicking a verse number in the reader (see ReadingPanel).
 */
export default function CrossRefsPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const verse = useAppStore((s) => s.activeVerse)
  const key = `${book}:${chapter}:${verse}`
  const [result, setResult] = useState<{ key: string; refs: CrossRef[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const refs = result?.key === key ? result.refs : null
  const bookName = BOOK_BY_ID[book]?.name ?? book

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (verse == null) return
    window.api
      .getCrossReferences(book, chapter, verse)
      .then((refs) => { if (!cancelled) setResult({ key, refs }) })
      .catch(() => { if (!cancelled) setError('Could not load cross-references.') })
    return () => { cancelled = true }
  }, [book, chapter, verse, key, attempt])

  if (verse == null) {
    return (
      <div className="mt-10 flex flex-col items-center text-center text-muted">
        <LinkIcon className="w-8 h-8 text-faint mb-3" />
        <p className="text-sm max-w-[16rem] leading-relaxed">
          Click a verse number in the text to see related passages (Treasury of Scripture Knowledge).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-faint">
        Cross-references · {bookName} {chapter}:{verse}
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="text-accent underline">Try again</button>
        </div>
      ) : refs == null ? (
        <p role="status" className="text-sm text-faint">Loading cross-references…</p>
      ) : refs.length ? (
        <VerseRefs refs={refs.map((r) => r.ref)} groupByBook />
      ) : (
        <p className="text-sm text-faint">
          No cross-references for this verse.
        </p>
      )}
    </div>
  )
}
