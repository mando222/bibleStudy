import { typedPassage, type ScripturePassage } from '@shared/refs'
import { readingEdition, useAppStore } from '@/store/useAppStore'

/** An interlinear switches source editions when the destination is in the other testament. */
export function readerPassage(input: string) {
  return typedPassage(input, book => readingEdition(useAppStore.getState(), book))
}

/** Resolve both endpoints in the installed edition before changing the reading position. */
export async function openPassage(ref: ScripturePassage, edition: string, signal?: AbortSignal): Promise<void> {
  const { book, chapter, lastChapter } = ref
  const interlinear = useAppStore.getState().interlinear
  const load = (n: number) => window.api.listReadingVerses({ translation: edition, book, chapter: n }, interlinear)
  const start = load(chapter)
  const [first, last] = await Promise.all([start, chapter === lastChapter ? start : load(lastChapter)])
  if (signal?.aborted) return
  if (!first.length || !last.length) throw new Error('This chapter is unavailable in ' + edition + '.')
  const begin = ref.firstVerse ?? first[0]
  const end = ref.lastVerse ?? last[last.length - 1]
  if (!first.includes(begin) || !last.includes(end)) throw new Error('This verse is unavailable in ' + edition + '.')
  if (lastChapter < chapter || (lastChapter === chapter && end < begin))
    throw new Error('Choose an ending verse at or after the first verse.')
  const range = lastChapter !== chapter || (ref.lastVerse != null && end !== begin)
  useAppStore.getState().goToVerse(book, chapter, begin, edition, range ? { chapter: lastChapter, verse: end } : undefined)
}
