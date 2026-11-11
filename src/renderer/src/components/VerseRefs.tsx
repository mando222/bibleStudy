import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { BOOKS, BOOK_BY_ID } from '@shared/books'
import { mapPassage } from '@shared/passageMapping'

// Canonical position of each book id, used to order grouped verse lists.
const BOOK_RANK: Record<string, number> = Object.fromEntries(BOOKS.map((b, i) => [b.id, i]))

/** A single clickable verse-reference chip that jumps the reader to that verse. */
function VerseChip({ refKey, displayEdition }: { refKey: string; displayEdition?: string }): JSX.Element {
  const goToVerse = useAppStore((s) => s.goToVerse)
  const [book, ch, v] = refKey.split('.')
  const canonical = { book, chapter: Number(ch), verse: Number(v) }
  const native = displayEdition && !displayEdition.startsWith('imp_') ? mapPassage(canonical, 'KJV', displayEdition) : null
  const ref = native ?? canonical
  const name = BOOK_BY_ID[ref.book]?.name ?? ref.book
  return (
    <button
      onClick={() => goToVerse(book, Number(ch), Number(v))}
      className="text-[11px] px-1.5 py-0.5 rounded border border-line text-accent hover:bg-accent-soft"
    >
      {name} {ref.chapter}:{ref.verse}{displayEdition && !native ? ' (KJV)' : ''}
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
  groupByBook,
  displayEdition
}: {
  refs: string[]
  limit?: number
  groupByBook?: boolean
  displayEdition?: string
}): JSX.Element {
  const [page, setPage] = useState<{ refs: string[]; count: number } | null>(null)
  const count = page?.refs === refs ? page.count : limit ?? refs.length
  const show = limit ? refs.slice(0, count) : refs
  const more = limit && count < refs.length ? (
    <button className="text-[11px] text-accent underline" onClick={() => setPage({ refs, count: count + limit })}>
      Show more ({refs.length - count} remaining)
    </button>
  ) : null

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
                <VerseChip key={i} refKey={r} displayEdition={displayEdition} />
              ))}
            </div>
          </div>
        ))}
        {more}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {show.map((r, i) => (
        <VerseChip key={i} refKey={r} displayEdition={displayEdition} />
      ))}
      {more}
    </div>
  )
}
