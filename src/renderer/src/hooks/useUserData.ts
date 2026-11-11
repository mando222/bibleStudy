import { useEffect, useMemo, useState } from 'react'
import { mapChapter, mapPassage } from '@shared/passageMapping'
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

/** Notes use canonical references. One native chapter can span more than one canonical chapter. */
export function useNotes(book: string, chapter: number, edition = 'KJV', verses?: { verse: number }[]) {
  const nonce = useAppStore((s) => s.userDataNonce)
  const [attempt, setAttempt] = useState(0)
  const chapters = useMemo(() => {
    const refs = verses?.length && edition === 'LXX'
      ? verses.map((v) => mapPassage({ book, chapter, verse: v.verse }, edition, 'KJV'))
      : [mapChapter({ book, chapter }, edition, 'KJV')]
    return [...new Set(refs.flatMap((r) => r ? [JSON.stringify([r.book, r.chapter])] : []))]
  }, [book, chapter, edition, verses])
  const key = JSON.stringify([chapters, nonce, attempt])
  const [result, setResult] = useState<{ key: string; notes: Note[]; error?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(chapters.map((id) => {
      const [book, chapter] = JSON.parse(id) as [string, number]
      return window.api.listNotes({ book, chapter })
    })).then((rows) => {
      if (!cancelled) setResult({ key, notes: rows.flat() })
    }).catch((e: unknown) => {
      if (!cancelled) setResult({ key, notes: [], error: e instanceof Error ? e.message : 'Could not load notes.' })
    })
    return () => { cancelled = true }
  }, [key, chapters])

  const byVerse = new Map<number, Note[]>()
  if (result?.key === key) {
    for (const note of result.notes) {
      const native = mapPassage(note, 'KJV', edition)
      if (!native || native.book !== book || native.chapter !== chapter) continue
      if (!byVerse.has(native.verse)) byVerse.set(native.verse, [])
      byVerse.get(native.verse)!.push(note)
    }
  }
  return { byVerse, notes: [...byVerse.values()].flat(), loading: result?.key !== key,
    error: result?.key === key ? result.error : undefined, retry: () => setAttempt((n) => n + 1) }
}
