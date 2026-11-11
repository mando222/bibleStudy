import { useEffect, useState } from 'react'

/** The memoized loader identifies one selection. Never show data from a previous selection or retry. */
export function useStudyQuery<T>(load: () => Promise<T>, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    load: typeof load
    attempt: number
    data?: T
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.resolve().then(load).then((data) => {
      if (!cancelled) setResult({ load, attempt, data })
    }).catch((error: unknown) => {
      if (!cancelled) setResult({ load, attempt, error: error instanceof Error ? error.message : 'Please try again.' })
    })
    return () => { cancelled = true }
  }, [load, attempt, enabled])

  const current = enabled && result?.load === load && result.attempt === attempt ? result : null
  return { data: current?.data ?? null, error: current?.error, loading: enabled && !current, retry: () => setAttempt(n => n + 1) }
}
