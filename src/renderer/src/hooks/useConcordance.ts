import { useEffect, useState } from 'react'
import type { ConcordanceResponse } from '@shared/types'

/** Every verse a Strong's number occurs in. Tagged with its id so the card never flashes
 *  "No tagged occurrences" for a word whose concordance is still loading. */
export function useConcordance(id: string | null): {
  data: ConcordanceResponse | null
  loading: boolean
} {
  const [state, setState] = useState<{ id: string | null; data: ConcordanceResponse | null }>({
    id: null,
    data: null
  })

  useEffect(() => {
    if (!id) {
      setState({ id: null, data: null })
      return
    }
    let cancelled = false
    window.api
      .getConcordance(id, { limit: 400 })
      .then((data) => {
        if (!cancelled) setState({ id, data })
      })
      .catch(() => {
        if (!cancelled) setState({ id, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const settled = state.id === id
  return { data: settled ? state.data : null, loading: id != null && !settled }
}
