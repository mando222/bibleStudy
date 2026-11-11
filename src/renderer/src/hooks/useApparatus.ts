import { useCallback } from 'react'
import { useStudyQuery } from './useStudyQuery'

export function useApparatus(book: string, chapter: number, enabled = true) {
  return useStudyQuery(useCallback(() => window.api.getChapterApparatus(book, chapter), [book, chapter]), enabled)
}
