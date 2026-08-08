import { useAppStore } from '@/store/useAppStore'

interface Props {
  book: string
  bookName: string
  chapter: number
  verse: number
  className?: string
}

/** Clickable scripture reference that navigates the reader to that verse. */
export default function ScriptureRef({ book, bookName, chapter, verse, className }: Props): JSX.Element {
  const goToVerse = useAppStore((s) => s.goToVerse)
  return (
    <button
      onClick={() => goToVerse(book, chapter, verse)}
      className={className ?? 'text-accent hover:underline font-semibold'}
    >
      {bookName} {chapter}:{verse}
    </button>
  )
}
