import { useAppStore } from '@/store/useAppStore'

interface Props {
  book: string
  bookName: string
  chapter: number
  verse: number
  translation?: string
  className?: string
}

/** Clickable scripture reference that navigates the reader to that verse. */
export default function ScriptureRef({ book, bookName, chapter, verse, translation, className }: Props): JSX.Element {
  const goToVerse = useAppStore((s) => s.goToVerse)
  const openSearchHit = useAppStore((s) => s.openSearchHit)
  return (
    <button
      onClick={() => translation
        ? openSearchHit({ translation, book, bookName, chapter, verse, snippet: '' })
        : goToVerse(book, chapter, verse)}
      className={className ?? 'text-accent hover:underline font-semibold'}
    >
      {bookName} {chapter}:{verse}
    </button>
  )
}
