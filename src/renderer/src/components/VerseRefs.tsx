import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'

/** Render "Book.ch.v" reference keys as clickable chips that jump the reader to each verse. */
export default function VerseRefs({ refs, limit }: { refs: string[]; limit?: number }): JSX.Element {
  const goToVerse = useAppStore((s) => s.goToVerse)
  const show = limit ? refs.slice(0, limit) : refs
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((r, i) => {
        const [book, ch, v] = r.split('.')
        const name = BOOK_BY_ID[book]?.name ?? book
        return (
          <button
            key={i}
            onClick={() => goToVerse(book, Number(ch), Number(v))}
            className="text-[11px] px-1.5 py-0.5 rounded border border-line text-accent hover:bg-accent-soft"
          >
            {name} {ch}:{v}
          </button>
        )
      })}
      {limit && refs.length > limit && (
        <span className="text-[11px] text-faint self-center">+{refs.length - limit} more</span>
      )}
    </div>
  )
}
