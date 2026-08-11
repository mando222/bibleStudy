import { useEffect, useState } from 'react'
import type { StrongsEntry } from '@shared/types'

/**
 * The Strong's entry for a word. The result is tagged with the id it belongs to, so a render that
 * happens after `id` changes but before the fetch resolves reports `loading` rather than briefly
 * claiming "no entry found" for a word we simply haven't looked up yet.
 */
export function useStrongs(id: string | null): { entry: StrongsEntry | null; loading: boolean } {
  const [state, setState] = useState<{ id: string | null; entry: StrongsEntry | null }>({
    id: null,
    entry: null
  })

  useEffect(() => {
    if (!id) {
      setState({ id: null, entry: null })
      return
    }
    let cancelled = false
    window.api
      .getStrongs(id)
      .then((entry) => {
        if (!cancelled) setState({ id, entry })
      })
      .catch(() => {
        if (!cancelled) setState({ id, entry: null })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const settled = state.id === id
  return { entry: settled ? state.entry : null, loading: id != null && !settled }
}
