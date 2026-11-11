import { mapPassage } from '@shared/passageMapping'
import { describeLayout } from '@shared/literaryLayout'
import type { StudyRange } from '@shared/passageStudy'
import type { ChapterContent, ChapterRef, Verse } from '@shared/types'

export interface LayoutComparison {
  edition: string
  status: 'recorded' | 'no-layout' | 'unavailable' | 'unverified'
  missing: number
  rows: { chapter: number; verse: number; marks: string[] }[]
}

/** Compare actual verses at mapped addresses; a split chapter may require more than one destination chapter. */
export async function compareLayout(range: StudyRange, editions: string[], getChapter: (ref: ChapterRef) => Promise<ChapterContent>): Promise<LayoutComparison[]> {
  const cache = new Map<string, Promise<Map<number, Verse>>>()
  const chapterAt = (edition: string, book: string, chapter: number) => {
    const key = JSON.stringify([edition, book, chapter])
    let result = cache.get(key)
    if (!result) {
      result = getChapter({ translation: edition, book, chapter }).then(c => new Map(c.verses.map(v => [v.verse, v])))
      cache.set(key, result)
    }
    return result
  }
  const source = await chapterAt(range.edition, range.book, range.chapter)
  const first = range.firstVerse
  const last = range.lastVerse ?? first
  const selected = [...source.keys()].filter(v => first == null || (v >= first && v <= last!))
  return Promise.all(editions.map(async (edition): Promise<LayoutComparison> => {
    const rows: LayoutComparison['rows'] = []
    if (range.edition !== edition && (edition.startsWith('imp_') || range.edition.startsWith('imp_'))) {
      return { edition, status: 'unverified', rows, missing: 0 }
    }
    let found = 0
    for (const v of selected) {
      const address = mapPassage({ book: range.book, chapter: range.chapter, verse: v }, range.edition, edition)
      if (!address) continue
      const verse = (await chapterAt(edition, address.book, address.chapter)).get(address.verse)
      if (!verse) continue
      found++
      const marks = describeLayout([verse], false)
      if (marks.length) rows.push({ chapter: address.chapter, verse: address.verse, marks })
    }
    return { edition, status: !found ? 'unavailable' : rows.length ? 'recorded' : 'no-layout', rows, missing: selected.length - found }
  }))
}
