import { useEffect, useState } from 'react'
import type { ConcordanceResponse } from '@shared/types'

/** Every verse a Strong's number occurs in. Tagged with its id so the card never flashes
 *  "No tagged occurrences" for a word whose concordance is still loading. */
export function useConcordance(
  id: string | null,
  translation?: string
): {
  data: ConcordanceResponse | null
  loading: boolean
} {
  const [state, setState] = useState<{ id: string | null; data: ConcordanceResponse | null }>({
    id: null,
    data: null
  })
  // Re-fetch when the reading translation changes, so the hits follow what you're reading.
  const key = `${id ?? ''}|${translation ?? ''}`

  useEffect(() => {
    if (!id) {
      setState({ id: null, data: null })
      return
    }
    let cancelled = false
    window.api
      .getConcordance(id, { limit: 400, translation })
      .then((data) => {
        if (!cancelled) setState({ id: key, data })
      })
      .catch(() => {
        if (!cancelled) setState({ id: key, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [id, translation, key])

  const settled = state.id === key
  return { data: settled ? state.data : null, loading: id != null && !settled }
}
