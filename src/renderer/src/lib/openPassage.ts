import { typedPassage, type ScripturePassage } from '@shared/refs'
import { readingEdition, useAppStore } from '@/store/useAppStore'

/** An interlinear switches source editions when the destination is in the other testament. */
export function readerPassage(input: string) {
  return typedPassage(input, book => readingEdition(useAppStore.getState(), book))
}

/** Verify the native chapter/verse against the actual installed text before navigating. */
export async function openPassage(ref: Pick<ScripturePassage, 'book' | 'chapter' | 'firstVerse'>, edition: string): Promise<void> {
  const { book, chapter, firstVerse } = ref
  const data = ['TR', 'BYZ', 'NA'].includes(edition)
    ? await window.api.getInterlinear(book, chapter, edition, [])
    : await window.api.getChapter({ translation: edition, book, chapter })
  if (!data.verses.length) throw new Error('This chapter is unavailable in ' + edition + '.')
  if (firstVerse != null && !data.verses.some(row => row.verse === firstVerse))
    throw new Error('This verse is unavailable in ' + edition + '.')
  useAppStore.getState().goToVerse(book, chapter, firstVerse ?? data.verses[0].verse, edition)
}
