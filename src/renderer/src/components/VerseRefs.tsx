import { useAppStore } from '@/store/useAppStore'
import { BOOKS, BOOK_BY_ID } from '@shared/books'

// Canonical position of each book id, used to order grouped verse lists.
const BOOK_RANK: Record<string, number> = Object.fromEntries(BOOKS.map((b, i) => [b.id, i]))

/** A single clickable verse-reference chip that jumps the reader to that verse. */
function VerseChip({ refKey }: { refKey: string }): JSX.Element {
  const goToVerse = useAppStore((s) => s.goToVerse)
  const [book, ch, v] = refKey.split('.')
  const name = BOOK_BY_ID[book]?.name ?? book
  return (
    <button
      onClick={() => goToVerse(book, Number(ch), Number(v))}
      className="text-[11px] px-1.5 py-0.5 rounded border border-line text-accent hover:bg-accent-soft"
    >
      {name} {ch}:{v}
    </button>
  )
}

/**
 * Render "Book.ch.v" reference keys as clickable chips.
 * With `groupByBook`, refs are grouped under a per-book heading (ordered canonically) so long
 * lists — e.g. every verse mentioning a person — read at a glance instead of as one flat wall.
 */
export default function VerseRefs({
  refs,
  limit,
  groupByBook
}: {
  refs: string[]
  limit?: number
  groupByBook?: boolean
}): JSX.Element {
  const show = limit ? refs.slice(0, limit) : refs

  if (groupByBook) {
    const groups = new Map<string, string[]>()
    for (const r of show) {
      const book = r.split('.')[0]
      const arr = groups.get(book)
      if (arr) arr.push(r)
      else groups.set(book, [r])
    }
    const ordered = [...groups.entries()].sort(
      (a, b) => (BOOK_RANK[a[0]] ?? 999) - (BOOK_RANK[b[0]] ?? 999)
    )
    const byRef = (a: string, b: string): number => {
      const [, ac, av] = a.split('.')
      const [, bc, bv] = b.split('.')
      return Number(ac) - Number(bc) || Number(av) - Number(bv)
    }
    return (
      <div className="flex flex-col gap-2">
        {ordered.map(([book, items]) => (
          <div key={book}>
            <div className="text-[11px] uppercase tracking-wider text-faint mb-1">
              {BOOK_BY_ID[book]?.name ?? book} · {items.length}
            </div>
            <div className="flex flex-wrap gap-1">
              {items.sort(byRef).map((r, i) => (
                <VerseChip key={i} refKey={r} />
              ))}
            </div>
          </div>
        ))}
        {limit && refs.length > limit && (
          <span className="text-[11px] text-faint">+{refs.length - limit} more</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {show.map((r, i) => (
        <VerseChip key={i} refKey={r} />
      ))}
      {limit && refs.length > limit && (
        <span className="text-[11px] text-faint self-center">+{refs.length - limit} more</span>
      )}
    </div>
  )
}
