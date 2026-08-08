import { useEffect, useState } from 'react'
import type { Edition, InterlinearContent } from '@shared/types'

let editionsCache: Edition[] | null = null

/** The available original-language editions (loaded once, cached). */
export function useEditions(): Edition[] {
  const [editions, setEditions] = useState<Edition[]>(editionsCache ?? [])
  useEffect(() => {
    if (editionsCache) return
    window.api
      .listEditions()
      .then((e) => {
        editionsCache = e
        setEditions(e)
      })
      .catch(() => undefined)
  }, [])
  return editions
}

interface State {
  data: InterlinearContent | null
  loading: boolean
  error: string | null
}

export function useInterlinear(book: string, chapter: number, edition: string): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!edition) {
      setState({ data: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    window.api
      .getInterlinear(book, chapter, edition)
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
  }, [book, chapter, edition])

  return state
}
