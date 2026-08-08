import { useEffect, useState } from 'react'
import type { StrongsEntry } from '@shared/types'

export function useStrongs(id: string | null): { entry: StrongsEntry | null; loading: boolean } {
  const [entry, setEntry] = useState<StrongsEntry | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) {
      setEntry(null)
      return
    }
    let cancelled = false
    setLoading(true)
    window.api
      .getStrongs(id)
      .then((e) => {
        if (!cancelled) {
          setEntry(e)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntry(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { entry, loading }
}
