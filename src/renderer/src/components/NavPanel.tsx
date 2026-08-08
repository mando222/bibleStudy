import { useState } from 'react'
import { BOOKS, BOOKS_CHRONO, type BookMeta } from '@shared/books'
import { useAppStore } from '@/store/useAppStore'
import { SearchIcon, ChevronRight } from './icons'

export default function NavPanel(): JSX.Element {
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const goTo = useAppStore((s) => s.goTo)
  const chronological = useAppStore((s) => s.chronological)
  const toggleChronological = useAppStore((s) => s.toggleChronological)
  const [openBook, setOpenBook] = useState<string | null>(book)
  const [filter, setFilter] = useState('')

  const q = filter.trim().toLowerCase()
  const source = chronological ? BOOKS_CHRONO : BOOKS
  const matches = q ? source.filter((b) => b.name.toLowerCase().includes(q)) : source
  const ot = matches.filter((b) => b.testament === 'OT')
  const nt = matches.filter((b) => b.testament === 'NT')

  const rowProps = { openBook, setOpenBook, current: book, currentChapter: chapter, goTo }
  const segBtn = (active: boolean): string =>
    `flex-1 py-1 transition-colors ${
      active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:bg-elevated'
    }`

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-2 border-b border-line space-y-2">
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a book…"
            className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm outline-none focus:border-accent placeholder:text-faint"
          />
        </div>
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
        {chronological ? (
          <>
            <SectionLabel>Chronological order</SectionLabel>
            {matches.map((b) => (
              <BookRow key={b.id} b={b} {...rowProps} />
            ))}
          </>
        ) : (
          <>
            {ot.length > 0 && <SectionLabel>Old Testament</SectionLabel>}
            {ot.map((b) => (
              <BookRow key={b.id} b={b} {...rowProps} />
            ))}
            {nt.length > 0 && <SectionLabel>New Testament</SectionLabel>}
            {nt.map((b) => (
              <BookRow key={b.id} b={b} {...rowProps} />
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
  openBook: string | null
  setOpenBook: (id: string | null) => void
  current: string
  currentChapter: number
  goTo: (book: string, chapter: number) => void
}

function BookRow({ b, openBook, setOpenBook, current, currentChapter, goTo }: RowProps): JSX.Element {
  const open = openBook === b.id
  const isCurrent = current === b.id
  return (
    <div>
      <button
        onClick={() => setOpenBook(open ? null : b.id)}
        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-left hover:bg-elevated rounded-md ${
          isCurrent ? 'text-accent font-medium' : 'text-ink'
        }`}
      >
        <ChevronRight className={`w-3.5 h-3.5 text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="truncate">{b.name}</span>
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-1 px-3 pb-2 pt-0.5">
          {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => {
            const active = isCurrent && currentChapter === c
            return (
              <button
                key={c}
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
