import { mapChapter, mapPassage } from '@shared/passageMapping'

/** A verse may be in a different chapter from the beginning of the source chapter, e.g. Psalm 9. */
export function readerChapter(book: string, chapter: number, verse: number | null, from: string, to: string) {
  return verse == null ? mapChapter({ book, chapter }, from, to)
    : mapPassage({ book, chapter, verse }, from, to)
}
