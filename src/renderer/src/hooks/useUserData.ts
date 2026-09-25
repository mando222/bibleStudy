import { useEffect, useState } from 'react'
import type { Highlight, Note } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'

/** Verse-level highlights for one translation+chapter, keyed by verse number. */
export function useHighlights(
  translation: string,
  book: string,
  chapter: number
): Map<number, Highlight> {
  const nonce = useAppStore((s) => s.userDataNonce)
  const key = `${translation}:${book}:${chapter}`
  const [result, setResult] = useState<{ key: string; map: Map<number, Highlight> } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listHighlights({ translation, book, chapter })
      .then((rows) => {
        if (cancelled) return
        const m = new Map<number, Highlight>()
        for (const h of rows) if (h.startToken == null) m.set(h.verse, h)
        setResult({ key, map: m })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [translation, book, chapter, nonce, key])

  return result?.key === key ? result.map : new Map()
}

/** All notes for a book+chapter, plus a per-verse index. */
export function useNotes(
  book: string,
  chapter: number
): { notes: Note[]; byVerse: Map<number, Note[]> } {
  const nonce = useAppStore((s) => s.userDataNonce)
  const key = `${book}:${chapter}`
  const [result, setResult] = useState<{ key: string; notes: Note[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listNotes({ book, chapter })
      .then((rows) => {
        if (!cancelled) setResult({ key, notes: rows })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [book, chapter, nonce, key])

  const notes = result?.key === key ? result.notes : []
  const byVerse = new Map<number, Note[]>()
  for (const n of notes) {
    if (!byVerse.has(n.verse)) byVerse.set(n.verse, [])
    byVerse.get(n.verse)!.push(n)
  }
  return { notes, byVerse }
}
