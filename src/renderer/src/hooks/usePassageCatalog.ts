import { useCallback } from 'react'
import { BOOKS, BOOKS_CHRONO, BOOK_BY_ID } from '@shared/books'
import type { ReadingChapter } from '@shared/types'
import { originalTextEdition, useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from './useStudyQuery'

/** Available chapters in reading order. Interlinear can have a separate source for each testament. */
export function usePassageCatalog() {
  const primary = useAppStore(s => s.primary)
  const interlinear = useAppStore(s => s.interlinear)
  const ot = useAppStore(s => interlinear ? originalTextEdition(s, 'OT') : '')
  const nt = useAppStore(s => interlinear ? originalTextEdition(s, 'NT') : '')
  const translations = useAppStore(s => s.translations)
  const chronological = useAppStore(s => s.chronological)
  const load = useCallback(async () => {
    let chapters: ReadingChapter[]
    if (interlinear) {
      const sources = [[ot, 'OT'], [nt, 'NT']] as const
      const parts = await Promise.all(sources.map(async ([edition, testament]) => {
        if (!edition) return []
        const rows = await window.api.listReadingChapters(edition, true)
        return rows.filter(row => BOOK_BY_ID[row.book]?.testament === testament)
      }))
      chapters = parts.flat()
    } else {
      chapters = await window.api.listReadingChapters(primary, false)
    }
    const order = new Map((chronological ? BOOKS_CHRONO : BOOKS).map((b, i) => [b.id, i]))
    return chapters.filter(row => order.has(row.book))
      .sort((a, b) => order.get(a.book)! - order.get(b.book)! || a.chapter - b.chapter)
  }, [primary, interlinear, ot, nt, translations, chronological])
  return useStudyQuery(load)
}
