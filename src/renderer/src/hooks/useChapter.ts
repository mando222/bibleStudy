import { useEffect, useState } from 'react'
import type { ChapterContent } from '@shared/types'

interface ChapterState {
  data: ChapterContent | null
  loading: boolean
  error: string | null
}

/** Fetch one chapter of one translation over IPC, re-fetching when the ref changes. */
export function useChapter(translation: string, book: string, chapter: number): ChapterState {
  const [state, setState] = useState<ChapterState>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    window.api
      .getChapter({ translation, book, chapter })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [translation, book, chapter])

  return state
}
