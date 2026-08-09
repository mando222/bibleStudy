import { useEffect, useState } from 'react'
import type { EventItem } from '@shared/types'
import VerseRefs from './VerseRefs'

const yr = (y: number | null): string => (y == null ? '—' : y < 0 ? `${-y} BC` : `${y} AD`)

/** Timelines: biblical events in chronological order, each linked to its scripture references. */
export default function TimelinesView(): JSX.Element {
  const [events, setEvents] = useState<EventItem[]>([])
  useEffect(() => {
    window.api
      .getEvents()
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="font-serif text-2xl text-ink mb-1">Timeline</h1>
        <p className="text-sm text-muted mb-6">
          {events.length} biblical events in order — each linked to the passage that records it.
        </p>
        <div className="relative border-l-2 border-line ml-2 pl-6 space-y-5">
          {events.map((e) => (
            <div key={e.id} className="relative">
              <span className="absolute -left-[1.68rem] top-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-bg" />
              <div className="text-xs font-mono text-accent">{yr(e.startYear)}</div>
              <div className="text-[15px] text-ink font-medium leading-snug">{e.title}</div>
              {e.participants.length > 0 && (
                <div className="text-xs text-muted mt-0.5">
                  {e.participants.slice(0, 10).map((p) => p.name).join(', ')}
                  {e.participants.length > 10 ? '…' : ''}
                </div>
              )}
              {e.places.length > 0 && (
                <div className="text-xs text-faint mt-0.5">
                  {e.places.map((p) => p.name).join(' · ')}
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
