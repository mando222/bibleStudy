import { useCallback } from 'react'
import { usePagedQuery } from './usePagedQuery'

export const CONCORDANCE_PAGE_SIZE = 400

export function useConcordance(id: string, translation: string) {
  const fetchPage = useCallback((offset: number) =>
    window.api.getConcordance(id, { limit: CONCORDANCE_PAGE_SIZE, translation, offset }), [id, translation])
  return usePagedQuery(JSON.stringify([id, translation]), fetchPage)
}
