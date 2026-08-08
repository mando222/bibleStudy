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
  const [map, setMap] = useState<Map<number, Highlight>>(new Map())

  useEffect(() => {
    let cancelled = false
    window.api
      .listHighlights({ translation, book, chapter })
      .then((rows) => {
        if (cancelled) return
        const m = new Map<number, Highlight>()
        for (const h of rows) if (h.startToken == null) m.set(h.verse, h)
        setMap(m)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [translation, book, chapter, nonce])

  return map
}

/** All notes for a book+chapter, plus a per-verse index. */
export function useNotes(
  book: string,
  chapter: number
): { notes: Note[]; byVerse: Map<number, Note[]> } {
  const nonce = useAppStore((s) => s.userDataNonce)
  const [notes, setNotes] = useState<Note[]>([])

  useEffect(() => {
    let cancelled = false
    window.api
      .listNotes({ book, chapter })
      .then((rows) => {
        if (!cancelled) setNotes(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [book, chapter, nonce])

  const byVerse = new Map<number, Note[]>()
  for (const n of notes) {
    if (!byVerse.has(n.verse)) byVerse.set(n.verse, [])
    byVerse.get(n.verse)!.push(n)
  }
  return { notes, byVerse }
}
