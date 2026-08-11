import { useEffect, useState } from 'react'
import type { LexiconGroup } from '@shared/types'

const EMPTY: LexiconGroup[] = []

/** Scholarly-lexicon entries for a Strong's number. Tagged with its id so the panel never shows a
 *  previous word's lexicons (or an empty state) while the new one is still loading. */
export function useLexicons(id: string | null): { groups: LexiconGroup[]; loading: boolean } {
  const [state, setState] = useState<{ id: string | null; groups: LexiconGroup[] }>({
    id: null,
    groups: EMPTY
  })

  useEffect(() => {
    if (!id) {
      setState({ id: null, groups: EMPTY })
      return
    }
    let cancelled = false
    window.api
      .getLexiconEntries(id)
      .then((groups) => {
        if (!cancelled) setState({ id, groups })
      })
      .catch(() => {
        if (!cancelled) setState({ id, groups: EMPTY })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const settled = state.id === id
  return { groups: settled ? state.groups : EMPTY, loading: id != null && !settled }
}
