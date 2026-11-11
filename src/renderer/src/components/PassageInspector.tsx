import { useCallback } from 'react'
import { useAppStore, type StudyInspector } from '@/store/useAppStore'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { compareLayout } from '@/lib/layoutComparison'
import { BOOK_BY_ID } from '@shared/books'
import VerseRefs from './VerseRefs'
import type { ContextEntity, StudyRange } from '@shared/passageStudy'

function Evidence({ entity, edition }: { entity: ContextEntity; edition: string }) {
  return <VerseRefs refs={entity.refs} displayEdition={edition} limit={6}/>
}
const when = (n: number) => n < 0 ? `${-n} BC` : `${n} AD`
function Context({ range }: { range: StudyRange }) {
  const openMap = useAppStore(s => s.openPassageMap)
  const openPerson = useAppStore(s => s.focusPerson)
  const load = useCallback(() => window.api.getPassageContext(range), [range])
  const { data, error, loading, retry } = useStudyQuery(load)
  if (error) return <p role="alert">Could not load passage context. <button className="text-accent" onClick={retry}>Try again</button></p>
  if (loading || !data) return <p role="status">Loading context…</p>
  if (data.status === 'unverified') return <p>This edition’s verse numbering has not been verified for passage context.</p>
  if (data.status === 'unmapped') return <p>No verified corresponding passage for these references.</p>
  if (data.status === 'unavailable') return <p>Passage unavailable in this edition.</p>
  return <>
    {data.status === 'partial' && <p className="mb-2">Only part of this passage has a verified reference.</p>}
    <button className="text-accent underline" onClick={() => openMap(range)}>Map this passage</button>
    {data.places.length > 0 && <section className="mt-4"><h3 className="font-semibold text-ink">Places</h3><ul>{data.places.map(p => <li key={p.id} className="py-1 border-b border-line/60">
      {p.name} <span className="text-xs text-faint">· {p.role === 'setting' ? 'Setting documented' : 'Mentioned'}</span><br/>
      <Evidence entity={p} edition={range.edition}/>
      {p.role === 'setting' && p.refs.some(key => !p.settingRefs.includes(key)) && <div className="text-xs">Setting in: <Evidence entity={{ ...p, refs: p.settingRefs }} edition={range.edition}/></div>}
    </li>)}</ul></section>}
    {data.people.length > 0 && <section className="mt-4"><h3 className="font-semibold text-ink">People</h3><ul>{data.people.map(p => <li key={p.id} className="py-1 border-b border-line/60"><button className="text-ink hover:underline" onClick={() => openPerson(p.id)}>{p.name}</button><br/><Evidence entity={p} edition={range.edition}/></li>)}</ul></section>}
    {data.events.length > 0 && <section className="mt-4"><h3 className="font-semibold text-ink">Events</h3><ul>{data.events.map(e => <li key={e.id} className="py-1 border-b border-line/60">{e.name}{(!!e.startYear || !!e.endYear) && <span className="block text-xs">Approx. {[e.startYear, e.endYear].filter((x, i, a): x is number => x != null && x !== 0 && a.indexOf(x) === i).map(when).join(' – ')}</span>}<br/><Evidence entity={e} edition={range.edition}/></li>)}</ul></section>}
    {!data.people.length && !data.places.length && !data.events.length ? <p className="mt-3">No people, places, or events are indexed for this passage.</p> : <p className="mt-3 text-xs text-faint">Verse links: Theographic and cited passage notes. A mention alone does not locate a person.</p>}
  </>
}
function Compare({ range }: { range: StudyRange }) {
  const editions = useAppStore(s => s.parallels)
  const names = useAppStore(s => s.translations)
  const load = useCallback(() => compareLayout(range, editions, ref => window.api.getChapter(ref)), [range, editions])
  const { data, error, loading, retry } = useStudyQuery(load, editions.length >= 2)
  if (editions.length < 2) return <p>Open a second translation to compare layouts.</p>
  if (error) return <p role="alert">Could not load the comparison. <button className="text-accent" onClick={retry}>Try again</button></p>
  if (loading || !data) return <p role="status">Loading layouts…</p>
  return <><p className="text-xs mb-2">Formatting recorded by each edition. Verse numbers below are native to that edition.</p>{data.map(column =>
    <section className="border-t border-line py-2" key={column.edition}><h3 className="text-ink font-semibold">{names.find(t => t.id === column.edition)?.name ?? column.edition}</h3>
      {column.status === 'unavailable' ? 'Passage unavailable.' : column.status === 'no-layout' ? 'No layout data for this passage.' : column.status === 'unverified' ? 'The imported edition has no verified cross-edition reference.' : <ul>{column.rows.map(row => <li key={row.chapter + ':' + row.verse} className="py-1 text-xs"><b>{row.chapter}:{row.verse}</b> · {row.marks.join(' · ')}</li>)}</ul>}
      {column.missing > 0 && column.status !== 'unavailable' && <p className="text-xs text-faint">{column.missing} selected verse(s) unavailable or without a verified equivalent.</p>}
    </section>)}</>
}
export default function PassageInspector({ inspector }: { inspector: StudyInspector }) {
  const close = useAppStore(s => s.inspectStudy)
  const { range, mode } = inspector
  const editionName = useAppStore(s => s.translations.find(t => t.id === range.edition)?.abbrev ?? range.edition)
  return <section aria-label={mode === 'context' ? 'Passage context' : 'Layout comparison'} className="h-full overflow-y-auto p-4 text-sm text-muted">
    <div className="flex items-center justify-between gap-2"><h2 className="font-serif text-lg text-ink">{mode === 'context' ? 'Passage context' : 'Compare layout'}</h2><button onClick={() => close(null)} className="text-xs text-accent">Close</button></div>
    <p className="mb-3 text-xs">{BOOK_BY_ID[range.book]?.name ?? range.book} {range.chapter}{range.firstVerse != null && ':' + range.firstVerse}{range.lastVerse != null && range.lastVerse !== range.firstVerse && '–' + range.lastVerse} · {editionName}</p>
    {mode === 'context' ? <Context range={range}/> : <Compare range={range}/>}
  </section>
}
