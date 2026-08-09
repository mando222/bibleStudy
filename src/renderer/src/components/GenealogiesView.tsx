import { useEffect, useState } from 'react'
import type { PersonListItem, PersonDetail, PersonRef } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { SearchIcon } from './icons'
import VerseRefs from './VerseRefs'

const years = (b: number | null, d: number | null): string => {
  const f = (y: number): string => (y < 0 ? `${-y} BC` : `${y} AD`)
  if (b == null && d == null) return ''
  return `${b == null ? '?' : f(b)} – ${d == null ? '?' : f(d)}`
}

/** Genealogies: browse biblical people; click one to see relationships and every verse about them. */
export default function GenealogiesView(): JSX.Element {
  const [q, setQ] = useState('')
  const [list, setList] = useState<PersonListItem[]>([])
  const [id, setId] = useState<number | null>(null)
  const [person, setPerson] = useState<PersonDetail | null>(null)
  const focusPersonId = useAppStore((s) => s.focusPersonId)
  const clearFocus = useAppStore((s) => s.clearFocus)

  // Arriving from another view (e.g. a Timeline participant) focuses that person.
  useEffect(() => {
    if (focusPersonId != null) {
      setId(focusPersonId)
      clearFocus()
    }
  }, [focusPersonId, clearFocus])

  useEffect(() => {
    const t = setTimeout(() => {
      window.api.getPeople(q.trim(), 400).then(setList).catch(() => setList([]))
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (id == null) return setPerson(null)
    window.api.getPerson(id).then(setPerson).catch(() => setPerson(null))
  }, [id])

  return (
    <div className="h-full flex bg-bg">
      <div className="w-[22rem] shrink-0 border-r border-line flex flex-col bg-panel">
        <div className="p-3 border-b border-line">
          <h2 className="font-serif text-lg text-ink mb-2">People</h2>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a name…"
              className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink outline-none focus:border-accent placeholder:text-faint"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => setId(p.id)}
              className={`w-full text-left px-3 py-2 border-b border-line/40 hover:bg-elevated ${
                id === p.id ? 'bg-accent-soft' : ''
              }`}
            >
              <div className="text-sm text-ink">{p.name}</div>
              <div className="text-xs text-faint">
                {years(p.birthYear, p.deathYear)}
                {p.verseCount ? ` · ${p.verseCount} verses` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {person ? (
          <div className="max-w-2xl">
            <h1 className="font-serif text-2xl text-ink">{person.name}</h1>
            <div className="text-sm text-muted mt-0.5">
              {[person.gender, years(person.birthYear, person.deathYear)].filter(Boolean).join(' · ')}
            </div>
            {person.summary && (
              <p className="mt-3 text-sm text-muted leading-relaxed">{person.summary}</p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Rel label="Father" people={person.father ? [person.father] : []} onPick={setId} />
              <Rel label="Mother" people={person.mother ? [person.mother] : []} onPick={setId} />
              <Rel label="Spouses" people={person.spouses} onPick={setId} />
              <Rel label="Children" people={person.children} onPick={setId} />
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wider text-faint mb-2">
                Referenced in {person.verses.length} verse{person.verses.length === 1 ? '' : 's'}
              </div>
              <VerseRefs refs={person.verses} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-muted">
            <p className="max-w-sm text-sm leading-relaxed">
              Pick a person to see their family and every verse that mentions them.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Rel({
  label,
  people,
  onPick
}: {
  label: string
  people: PersonRef[]
  onPick: (id: number) => void
}): JSX.Element {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-faint mb-1">{label}</div>
      {people.length ? (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className="text-sm text-accent hover:underline"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-sm text-faint">—</span>
      )}
    </div>
  )
}
