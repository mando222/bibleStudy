import { useEffect, useMemo, useState } from 'react'
import { BOOKS, BOOKS_CHRONO, type BookMeta } from '@shared/books'
import { matchingBooks } from '@shared/refs'
import { openPassage, readerPassage } from '@/lib/openPassage'
import { usePassageCatalog } from '@/hooks/usePassageCatalog'
import { readerChapter } from '@/lib/passage'
import { readingEdition, useAppStore } from '@/store/useAppStore'
import { SearchIcon, ChevronRight } from './icons'

export default function NavPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const goTo = useAppStore((s) => s.goTo)
  const chronological = useAppStore((s) => s.chronological)
  const toggleChronological = useAppStore((s) => s.toggleChronological)
  const [openBook, setOpenBook] = useState<string | null>(book)
  const [filter, setFilter] = useState('')

  const catalog = usePassageCatalog()
  const chapters = useMemo(() => {
    const grouped = new Map<string, number[]>()
    for (const row of catalog.data ?? []) {
      if (!grouped.has(row.book)) grouped.set(row.book, [])
      grouped.get(row.book)!.push(row.chapter)
    }
    return grouped
  }, [catalog.data])
  const q = filter.trim().toLowerCase()
  const source = chronological ? BOOKS_CHRONO : BOOKS
  const matching = q ? new Set(matchingBooks(q)) : null
  const matches = source.filter(b => chapters.has(b.id) && (!matching || matching.has(b.id)))
  const ot = matches.filter((b) => b.testament === 'OT')
  const nt = matches.filter((b) => b.testament === 'NT')

  const edition = useAppStore(readingEdition)
  const ref = readerPassage(filter)
  const [issue, setIssue] = useState('')
  const [opening, setOpening] = useState(false)
  async function open() {
    if (!ref || opening) return
    setOpening(true)
    try { await openPassage(ref, ref.edition); setFilter(''); setIssue('') }
    catch (error) { setIssue(error instanceof Error ? error.message : 'Could not open this passage.') }
    finally { setOpening(false) }
  }
  const sourceEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const verse = useAppStore((s) => s.activeVerse)
  const current = readerChapter(book, chapter, verse, sourceEdition, edition)
  useEffect(() => { setOpenBook(book) }, [book])
  const rowProps = { openBook, setOpenBook, current: current?.book ?? '', currentChapter: current?.chapter ?? 0, goTo }
  const segBtn = (active: boolean): string =>
    `flex-1 py-1 transition-colors ${
      active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-elevated'
    }`

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-2 border-b border-line space-y-2">
        <form onSubmit={e => { e.preventDefault(); void open() }}>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setIssue('') }}
              aria-label="Find a book or go to passage" placeholder="Book or passage (John 3:16)"
              className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm outline-none focus:border-accent placeholder:text-faint"
            />
          </div>
          {ref && <button disabled={opening} className="mt-2 text-sm text-accent" type="submit">Go to passage · {filter.trim()}</button>}
          {issue && <p role="alert" className="text-xs text-muted">{issue}</p>}
          {q && catalog.data && !ref && !matches.length && <p role="status" className="mt-2 text-xs text-muted">No matching book or reference in {edition}. Try John 3:16.</p>}
        </form>
        <div className="flex rounded-md border border-line overflow-hidden text-xs" title="Book order">
          <button onClick={() => chronological && toggleChronological()} className={segBtn(!chronological)}>
            Canonical
          </button>
          <button onClick={() => !chronological && toggleChronological()} className={segBtn(chronological)}>
            Chronological
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {catalog.loading && <p className="px-3 text-sm text-muted" role="status">Loading books…</p>}
        {catalog.error && <p className="px-3 text-sm" role="alert">Couldn’t load books. <button onClick={catalog.retry} className="underline">Retry</button></p>}
        {chronological ? (
          <>
            <SectionLabel>Chronological order</SectionLabel>
            {matches.map((b) => (
              <BookRow key={b.id} b={b} chapters={chapters.get(b.id)!} {...rowProps} />
            ))}
          </>
        ) : (
          <>
            {ot.length > 0 && <SectionLabel>Old Testament</SectionLabel>}
            {ot.map((b) => (
              <BookRow key={b.id} b={b} chapters={chapters.get(b.id)!} {...rowProps} />
            ))}
            {nt.length > 0 && <SectionLabel>New Testament</SectionLabel>}
            {nt.map((b) => (
              <BookRow key={b.id} b={b} chapters={chapters.get(b.id)!} {...rowProps} />
            ))}
          </>
        )}
      </nav>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  )
}

interface RowProps {
  b: BookMeta
  chapters: number[]
  openBook: string | null
  setOpenBook: (id: string | null) => void
  current: string
  currentChapter: number
  goTo: (book: string, chapter: number) => void
}

function BookRow({ b, chapters, openBook, setOpenBook, current, currentChapter, goTo }: RowProps): JSX.Element {
  const open = openBook === b.id
  const isCurrent = current === b.id
  return (
    <div>
      <button
        onClick={() => setOpenBook(open ? null : b.id)}
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-left hover:bg-elevated rounded-md ${
          isCurrent ? 'text-accent font-medium' : 'text-ink'
        }`}
      >
        <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="truncate">{b.name}</span>
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-1 px-3 pb-2 pt-0.5">
          {chapters.map((c) => {
            const active = isCurrent && currentChapter === c
            return (
              <button
                key={c}
                aria-current={active ? 'page' : undefined}
                onClick={() => goTo(b.id, c)}
                className={`h-7 rounded text-xs tabular-nums transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-accent-soft hover:text-accent'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
