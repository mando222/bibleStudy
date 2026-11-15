import { useMemo, useState } from 'react'
import { catalogRefLabel } from '@shared/books'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { useAppStore } from '@/store/useAppStore'
import VerseRefs from './VerseRefs'

const yr = (y: number | null): string => (y == null ? '—' : y < 0 ? `${-y} BC` : `${y} AD`)

const loadEvents = () => window.api.getEvents()

/** Timelines: biblical events in chronological order, each linked to its scripture references. */
export default function TimelinesView(): JSX.Element {
  const events = useStudyQuery(loadEvents)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number[]>([])
  const visible = useMemo(() => {
    const key = query.trim().toLowerCase()
    if (!key) return events.data ?? []
    return (events.data ?? []).filter(e =>
      [e.title, ...e.participants.map(p => p.name), ...e.places.map(p => p.name), ...e.verses.map(catalogRefLabel)]
        .some(value => value.toLowerCase().includes(key)))
  }, [events.data, query])
  const focusPerson = useAppStore((s) => s.focusPerson)
  const focusPlace = useAppStore((s) => s.focusPlace)
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="font-serif text-2xl text-ink mb-1">Timeline</h1>
        <label className="block text-sm text-muted mt-3">Find an event
          <input type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Event, person, place or verse" className="block w-full bg-panel border border-line rounded px-3 py-2 my-1 text-ink" />
        </label>
        <p className="text-sm text-muted mb-5" role="status">
          {events.error ? <>{events.error} <button onClick={events.retry}>Retry</button></> : events.loading ? 'Loading events…' :
            query.trim() ? `${visible.length} of ${events.data?.length} events` : `${visible.length} events`}
        </p>

        <div className="relative border-l-2 border-line ml-2 pl-6 space-y-5">
          {visible.map((e) => (
            <div key={e.id} className="relative">
              <span className="absolute -left-[1.68rem] top-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-bg" />
              <div className="text-xs font-mono text-accent">{e.startYear == null ? 'Date unrecorded' : `Approx. ${yr(e.startYear)}${e.endYear != null && e.endYear !== e.startYear ? ' – ' + yr(e.endYear) : ''} · Theographic chronology`}</div>
              <div className="text-[15px] text-ink font-medium leading-snug">{e.title}</div>
              {e.participants.length > 0 && (
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-1.5">
                  {e.participants.slice(0, expanded.includes(e.id) ? undefined : 12).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => focusPerson(p.id)}
                      className="hover:text-accent hover:underline"
                    >
                      {p.name}
                    </button>
                  ))}
                  {e.participants.length > 12 && <button className="text-accent underline" aria-expanded={expanded.includes(e.id)}
                    onClick={() => setExpanded(ids => ids.includes(e.id) ? ids.filter(id => id !== e.id) : [...ids, e.id])}>
                    {expanded.includes(e.id) ? 'Show fewer participants' : `Show ${e.participants.length - 12} more participants`}
                  </button>}
                </div>
              )}
              {e.places.length > 0 && (
                <div className="text-xs text-faint mt-0.5 flex flex-wrap gap-x-1.5">
                  {e.places.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => focusPlace(p.id)}
                      className="hover:text-accent hover:underline"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {e.verses.length > 0 && (
                <div className="mt-1.5">
                  <VerseRefs refs={e.verses} limit={10} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
