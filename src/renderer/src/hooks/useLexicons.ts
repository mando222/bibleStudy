import { useEffect, useState } from 'react'
import type { LexiconGroup } from '@shared/types'

export function useLexicons(id: string | null): { groups: LexiconGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<LexiconGroup[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) {
      setGroups([])
      return
    }
    let cancelled = false
    setLoading(true)
    window.api
      .getLexiconEntries(id)
      .then((g) => {
        if (!cancelled) {
          setGroups(g)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { groups, loading }
}
