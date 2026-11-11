import { useCallback } from 'react'
import { useStudyQuery } from './useStudyQuery'

export function useStrongs(id: string | null) {
  const load = useCallback(() => window.api.getStrongs(id!), [id])
  const { data: entry, error, loading, retry } = useStudyQuery(load, !!id)
  return { entry, error, loading, retry }
}
