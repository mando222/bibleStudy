import { useCallback, useMemo } from 'react'
import { mapPassage } from '@shared/passageMapping'
import { useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from './useStudyQuery'

/** Resolve each printed verse independently. A translation can move a verse or omit one
 * between the two ends of a selection, and an import has no verified peer coordinates. */
export function useNavigationRange(book: string, chapter: number, edition: string, interlinear: boolean,
  verses?: readonly { verse: number }[]) {
  const range = useAppStore(s => s.navigationRange)
  const matches = useMemo(() => {
    const local = new Set<number>()
    const bySourceChapter = new Map<number, { local: number; source: number }[]>()
    if (!range || range.book !== book || !verses) return { local, bySourceChapter }
    for (const { verse } of verses) {
      const source = mapPassage({ book, chapter, verse }, edition, range.edition)
      if (!source || source.chapter < range.chapter || source.chapter > range.lastChapter ||
          (source.chapter === range.chapter && source.verse < range.firstVerse) ||
          (source.chapter === range.lastChapter && source.verse > range.lastVerse)) continue
      if (edition === range.edition && interlinear === range.interlinear) {
        local.add(verse)
      } else {
        const group = bySourceChapter.get(source.chapter) ?? []
        group.push({ local: verse, source: source.verse })
        bySourceChapter.set(source.chapter, group)
      }
    }
    return { local, bySourceChapter }
  }, [range, book, chapter, edition, interlinear, verses])
  const load = useCallback(async () => {
    const marked = new Set<number>()
    if (range) await Promise.all([...matches.bySourceChapter].map(async ([nativeChapter, candidates]) => {
      const recorded = new Set(await window.api.listReadingVerses({
        translation: range.edition, book, chapter: nativeChapter
      }, range.interlinear))
      for (const pair of candidates) if (recorded.has(pair.source)) marked.add(pair.local)
    }))
    return marked
  }, [range, matches, book])
  const { data } = useStudyQuery(load, matches.bySourceChapter.size > 0)
  return data ?? matches.local
}
