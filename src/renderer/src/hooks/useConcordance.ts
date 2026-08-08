import { useEffect, useState } from 'react'
import type { ConcordanceResponse } from '@shared/types'

export function useConcordance(id: string | null): {
  data: ConcordanceResponse | null
  loading: boolean
} {
  const [data, setData] = useState<ConcordanceResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    window.api
      .getConcordance(id, { limit: 400 })
      .then((r) => {
        if (!cancelled) {
          setData(r)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { data, loading }
}
