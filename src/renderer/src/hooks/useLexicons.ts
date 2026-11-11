import { useCallback } from 'react'
import { useStudyQuery } from './useStudyQuery'

export function useLexicons(id: string) {
  const load = useCallback(() => window.api.getLexiconEntries(id), [id])
  const { data, error, loading, retry } = useStudyQuery(load)
  return { groups: data ?? [], error, loading, retry }
}
