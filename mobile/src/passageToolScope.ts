import { readerChapter } from '@/lib/passage'

export type PassageToolColumn = { translation: string; book: string; chapter: number; verse?: number }
type ReaderScope = {
  book: string; chapter: number; activeVerse: number | null; primary: string;
  referenceEdition: string; parallels: string[]; interlinear: boolean
}

/** Keep tool actions in the native numbering of the displayed translation. */
export function passageToolColumns(state: ReaderScope, visible: PassageToolColumn[]): PassageToolColumn[] {
  const source = state.referenceEdition || state.primary
  const editions = state.interlinear ? [state.primary] : state.parallels
  const choices = editions.flatMap(translation => {
    const mapped = readerChapter(state.book, state.chapter, state.activeVerse, source, translation)
    if (!mapped) return []
    const column = visible.find(col => col.translation === translation && col.book === mapped.book &&
      col.chapter === mapped.chapter && Number.isInteger(col.verse) && col.verse! >= 0)
    return [{ translation, book: mapped.book, chapter: mapped.chapter,
      verse: column?.verse ?? ('verse' in mapped ? Number(mapped.verse) : undefined) }]
  })
  const preferred = choices.find(col => col.translation === source)
  return preferred ? [preferred, ...choices.filter(col => col !== preferred)] : choices
}
