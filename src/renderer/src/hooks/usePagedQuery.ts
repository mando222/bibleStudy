import { useEffect, useState } from 'react'

/** Resolve just the current page. Changing filters, edition or word starts a new first page. */
export function usePagedQuery<T>(
  key: string,
  fetchPage: (offset: number) => Promise<T>,
  delay = 0,
  enabled = true
) {
  const [page, setPage] = useState({ key, offset: 0 })
  const [attempt, setAttempt] = useState(0)
  const offset = page.key === key ? page.offset : 0
  const [result, setResult] = useState<{
    key: string; offset: number; attempt: number; data?: T; error?: string
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () => fetchPage(offset)
      .then((data) => { if (!cancelled) setResult({ key, offset, attempt, data }) })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, offset, attempt, error: err instanceof Error ? err.message : 'Please try again.' })
      })
    const timer = delay && !offset ? setTimeout(load, delay) : null
    if (!timer) void load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [key, offset, fetchPage, delay, enabled, attempt])

  // Discard the previous page position even if the reader later returns to the same query.
  useEffect(() => { setPage({ key, offset: 0 }) }, [key])
  const current = enabled && result?.key === key && result.offset === offset && result.attempt === attempt ? result : null
  return {
    data: current?.data ?? null, error: current?.error ?? null, loading: enabled && !current,
    offset, setOffset: (next: number) => setPage({ key, offset: next }),
    retry: () => setAttempt((n) => n + 1)
  }
}
