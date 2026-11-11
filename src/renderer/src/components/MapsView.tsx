import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlaceItem } from '@shared/types'
import type { PersonMapStop, StudyRange } from '@shared/passageStudy'
import { BOOK_BY_ID } from '@shared/books'
import { journeySegments, locationKind, locationLabel, mapShapes, placeMatches, regionQualifier, sliderFromYear, yearFromSlider } from '@shared/atlas'
import { useAppStore } from '@/store/useAppStore'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import AtlasCanvas from './AtlasCanvas'
import VerseRefs from './VerseRefs'

const emptyPlaces: PlaceItem[] = []
const emptyStops: PersonMapStop[] = []
const field = 'w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-sm text-ink'
const action = 'rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-accent hover:bg-elevated'
const loadPlaces = () => window.api.getPlaces()
const loadMappedPeople = () => window.api.getMappedPeople()
const loadRegions = async () => {
  const source = await window.api.getMapRegions()
  return source ? mapShapes(JSON.parse(source)) : []
}
const refLabel = (ref: string) => {
  const [book, ch, verse] = ref.split('.')
  return (BOOK_BY_ID[book]?.name ?? book) + ' ' + ch + ':' + verse
}
function rangeLabel(range: StudyRange) {
  const verses = range.firstVerse == null ? '' : ':' + range.firstVerse +
    (range.lastVerse && range.lastVerse !== range.firstVerse ? '–' + range.lastVerse : '')
  return (BOOK_BY_ID[range.book]?.name ?? range.book) + ' ' + range.chapter + verses + ' · ' + range.edition
}
const contextMessages = {
  unmapped: 'No verified mapping is available for this passage.',
  unavailable: 'This passage is unavailable in the selected edition.',
  unverified: 'The numbering of this edition has no verified passage mapping.',
  partial: 'Only the verses with a verified mapping are shown.',
  available: ''
}

function PersonSearch({ onPerson }: { onPerson: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const result = useStudyQuery(loadMappedPeople)
  const name = query.trim().toLowerCase()
  const matches = result.data?.filter(person => person.displayName.toLowerCase().startsWith(name)
    || [person.name, ...person.aliases].some(label => label.toLowerCase().includes(name)))
  return <div className="min-h-0 flex-1 flex flex-col">
    <label className="block p-3 text-xs text-muted">Search for a person
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} className={field + ' mt-1'} placeholder="Person’s name" />
    </label>
    <div role="region" className="overflow-auto" aria-label="People with documented locations">
      {result.loading && <p role="status" className="px-3 text-sm text-muted">Loading mapped people…</p>}
      {result.error && <button className={action} onClick={result.retry}>People unavailable · Retry</button>}
      {matches?.length === 0 && <p role="status" className="px-3 text-sm text-muted">{name
        ? 'No people with documented locations match this name.' : 'No people have documented locations in this atlas.'}</p>}
      {matches?.map(person => <button key={person.id} onClick={() => onPerson(person.id)}
        className="block w-full text-left px-3 py-2 text-sm border-b border-line/50 hover:bg-elevated">
        {person.displayName}{' '}<span className="ml-1 text-xs text-muted">{person.mappedPlaceCount} documented {person.mappedPlaceCount === 1 ? 'location' : 'locations'}</span></button>)}
    </div>
  </div>
}

function PlaceEvidence({ place, edition }: { place: PlaceItem; edition?: string }) {
  const result = useStudyQuery(useCallback(() => window.api.getPlaceVerses(place.id), [place.id]))
  const kind = locationKind(place)
  const qualifier = regionQualifier(place)
  return <section className="p-3 border-t border-line max-h-[35%] overflow-y-auto" aria-label="Place details">
    <h3 className="font-serif text-lg">{place.name}{qualifier && <span className="ml-2 text-sm text-muted">{qualifier}</span>}</h3>
    <p className="text-xs text-muted">
      {[place.featureType, locationLabel(place)].filter(Boolean).join(' · ')}
      {kind === 'point' && place.precision === 'Precise' && place.lat != null && place.lon != null && ' · ' + place.lat.toFixed(2) + '°, ' + place.lon.toFixed(2) + '°'}
    </p>
    {kind === 'area' && <p className="text-xs text-muted">The marker represents the general area.</p>}
    {place.precision && place.precision !== 'Unlocated' && <p className="text-xs text-muted">Source precision: {place.precision}</p>}
    {place.comment && <p className="mt-1 text-xs text-muted">Location note: {place.comment}</p>}
    {place.identificationNote && <p className="mt-1 text-xs text-muted">Theographic note on the Recogito identification: {place.identificationNote}</p>}
    {place.aliases.length > 0 && <p className="mt-1 text-xs text-muted">Also listed as {place.aliases.join(', ')}.</p>}
    <h4 className="mt-2 text-xs font-medium text-muted">References to this place</h4>
    <div className="mt-1">{result.data?.length ? <VerseRefs refs={result.data} limit={35} displayEdition={edition} followReader />
      : result.error ? <button className={action} onClick={result.retry}>References unavailable · Retry</button>
      : <span className="text-xs text-muted">{result.loading ? 'Loading references…' : 'No recorded verse references.'}</span>}</div>
  </section>
}

export default function MapsView(): JSX.Element {
  const catalog = useStudyQuery(loadPlaces)
  const kingdomShapes = useStudyQuery(loadRegions)
  const all = catalog.data ?? emptyPlaces
  const byId = useMemo(() => new Map(all.map(p => [p.id, p])), [all])
  const target = useAppStore(s => s.atlasTarget)
  const origin = useAppStore(s => s.atlasOrigin)
  const clearTarget = useAppStore(s => s.clearAtlasTarget)
  const returnFromAtlas = useAppStore(s => s.returnFromAtlas)
  const openPerson = useAppStore(s => s.openPersonMap)
  const focusPlaceId = useAppStore(s => s.focusPlaceId)
  const clearFocus = useAppStore(s => s.clearFocus)
  const setActivePlace = useAppStore(s => s.setActivePlace)
  const showRegions = useAppStore(s => s.mapShowRegions)
  const setShowRegions = useAppStore(s => s.setMapShowRegions)
  const storedYear = useAppStore(s => s.mapYear)
  const setYear = useAppStore(s => s.setMapYear)
  const year = storedYear || 1
  const activeRegions = useMemo(() => (kingdomShapes.data ?? []).filter(r =>
    showRegions && r.from != null && r.to != null && r.from <= year && year <= r.to), [kingdomShapes.data, year, showRegions])
  const [personPicker, showPeople] = useState(false)
  const [query, setQuery] = useState('')
  const [ftype, setFtype] = useState('')
  const [showAreas, setShowAreas] = useState(false)
  const [pageSize, setPageSize] = useState(80)
  const [selected, setSelected] = useState<PlaceItem | null>(null)
  const [focus, setFocus] = useState<PlaceItem[] | null>(null)
  const [connect, setConnect] = useState(false)
  const range = target?.kind === 'passage' ? target.passage : null
  const personId = target?.kind === 'person' ? target.personId : null
  const citationEdition = range?.edition ?? origin?.passage?.edition
  const context = useStudyQuery(useCallback(() => window.api.getPassageContext(range!), [range]), !!range)
  const person = useStudyQuery(useCallback(() => window.api.getPersonMap(personId!), [personId]), personId != null)
  const stops = person.data?.stops ?? emptyStops
  const segments = useMemo(() => journeySegments(stops, byId), [stops, byId])
  const scoped = useMemo(() => {
    const ids = personId != null ? stops.map(s => s.placeId) : context.data?.places.map(p => p.id) ?? []
    return [...new Set(ids)].map(id => byId.get(id)).filter((p): p is PlaceItem => !!p)
  }, [personId, stops, context.data, byId])
  useEffect(() => {
    setSelected(null)
    setFocus(target ? scoped : null)
    setConnect(false)
  }, [target, scoped])
  useEffect(() => { if (target) showPeople(false) }, [target])
  const select = useCallback((p: PlaceItem) => {
    setSelected(p)
    if (locationKind(p) !== 'unlocated') setFocus([p])
  }, [])
  useEffect(() => {
    if (focusPlaceId == null || !catalog.data) return
    const place = byId.get(focusPlaceId)
    if (place) {
      select(place)
      showPeople(false)
      setQuery('')
      setFtype('')
    }
    clearFocus()
  }, [focusPlaceId, catalog.data, byId, select, clearFocus])
  useEffect(() => {
    setActivePlace(selected && { id: selected.id, name: selected.name })
    return () => setActivePlace(null)
  }, [selected, setActivePlace])

  const filtered = useMemo(() => all.filter(p => placeMatches(p, query) && (!ftype || ftype === p.featureType)), [all, query, ftype])
  const types = useMemo(() => [...new Set(all.map(p => p.featureType).filter((t): t is string => !!t))].sort(), [all])
  const visible = target ? scoped : filtered.filter(p => locationKind(p) !== 'area' || showAreas || !!ftype || p.id === selected?.id)
  const sameNames = useMemo(() => {
    const seen = new Set<string>(), duplicates = new Set<string>()
    for (const p of all) {
      const name = p.name.toLowerCase()
      if (seen.has(name)) duplicates.add(name)
      seen.add(name)
    }
    return duplicates
  }, [all])
  const directoryTitle = target?.kind === 'person' ? person.data?.displayName ?? 'Person map' : range ? rangeLabel(range) : 'Places'
  const hasLocatedPlace = scoped.some(place => locationKind(place) !== 'unlocated')
  const scopedEmpty = !context.loading && !person.loading && !context.error && !person.error && !scoped.length

  function placeButton(p: PlaceItem, prefix = '') {
    const qualifier = regionQualifier(p)
    let subtitle = [qualifier, p.featureType, locationKind(p) === 'unlocated' || locationKind(p) === 'proposed' ? locationLabel(p) : null]
      .filter(Boolean).join(' · ')
    if (sameNames.has(p.name.toLowerCase()) || p.ambiguous) subtitle += (subtitle ? ' · ' : '') + (p.firstRef ? refLabel(p.firstRef) : 'Atlas record ' + p.id)
    return <button onClick={() => select(p)} aria-pressed={selected?.id === p.id}
      className={'w-full text-left px-3 py-1.5 hover:bg-elevated ' + (selected?.id === p.id ? 'bg-accent-soft' : '')}>
      <span className="block text-sm">{prefix}{p.name}</span>
      {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
    </button>
  }

  return <div className="h-full flex bg-bg">
    <aside className="w-64 max-w-[42%] shrink-0 flex flex-col border-r border-line bg-panel">
      <div className="p-3 border-b border-line space-y-2">
        <h2 className="font-serif text-lg">{personPicker ? 'People with documented locations' : directoryTitle}</h2>
        <div className="flex flex-wrap gap-1">
          {(personPicker || target) && <button className={action} onClick={() => { clearTarget(); showPeople(false); setQuery(''); setFtype('') }}>All places</button>}
          {!personPicker && <button className={action} onClick={() => {
            clearTarget()
            setSelected(null)
            setFocus(null)
            showPeople(true)
          }}>Map a person</button>}
          {target && !personPicker && hasLocatedPlace &&
            <button className={action} onClick={() => setFocus([...scoped])}>Fit all locations</button>}
          {origin && origin.activity !== 'maps' && <button className={action} onClick={returnFromAtlas}>
            {origin.activity === 'bible' ? 'Back to passage' : 'Back to profile'}</button>}
        </div>
        {!target && !personPicker && <>
          <input value={query} aria-label="Search places and aliases" placeholder="Search places or aliases…"
            onChange={e => { setQuery(e.target.value); setPageSize(80) }} className={field} />
          <select aria-label="Filter by place type" className={field} value={ftype} onChange={e => { setFtype(e.target.value); setPageSize(80) }}>
            <option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showAreas} onChange={e => setShowAreas(e.target.checked)} />Show regions and rivers on map</label>
          <p className="text-xs text-faint">{filtered.length} {filtered.length === 1 ? 'place' : 'places'}</p>
        </>}
        {segments.length > 0 && <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" checked={connect} onChange={e => setConnect(e.target.checked)} />Sequence only; road unknown.</label>}
      </div>
      {personPicker ? <PersonSearch onPerson={id => { showPeople(false); openPerson(id) }} /> :
        <div className="flex-1 overflow-y-auto">
          {catalog.error && <button className={action} onClick={catalog.retry}>Place catalog unavailable · Retry</button>}
          {!target && <>
            {filtered.slice(0, pageSize).map(p => <div key={p.id} className="border-b border-line/50">{placeButton(p)}</div>)}
            {pageSize < filtered.length && <button className={action + ' m-3'} onClick={() => setPageSize(n => n + 80)}>Show more places ({filtered.length - pageSize} remaining)</button>}
            {catalog.data && !filtered.length && <p className="p-3 text-sm text-muted">No places match these filters.</p>}
          </>}
          {range && context.data && <>
            {contextMessages[context.data.status] && <p className="p-3 text-xs text-muted">{contextMessages[context.data.status]}</p>}
            {context.data.places.map(item => {
              const place = byId.get(item.id)
              return place && <div key={item.id} className="border-b border-line/50 pb-2">
                {placeButton(place)}<div className="px-3 text-xs text-muted">
                  {item.settingRefs.length > 0 && <div>Cited setting<VerseRefs refs={item.settingRefs} displayEdition={range.edition} limit={5} /></div>}
                  {item.refs.some(ref => !item.settingRefs.includes(ref)) && <div>Mentioned in passage
                    <VerseRefs refs={item.refs.filter(ref => !item.settingRefs.includes(ref))} displayEdition={range.edition} limit={5} /></div>}
                </div>
              </div>
            })}
          </>}
          {stops.map((stop, i) => {
            const place = byId.get(stop.placeId)
            return place && <div key={i} className="border-b border-line/50 pb-2">
              {stop.journey && (i === 0 || stops[i - 1].journey !== stop.journey) &&
                <p className="px-3 pt-3 text-xs font-medium text-muted">{stop.journey}</p>}
              {placeButton(place, stop.order == null ? '' : stop.order + '. ')}
              <div className="px-3 text-xs text-muted">{stop.role} · {stop.label}
                <div className="mt-1"><VerseRefs refs={stop.refs} displayEdition={citationEdition} followReader limit={4} /></div><span className="text-faint">{stop.source}</span>
              </div></div>
          })}
          {target && (context.loading || person.loading) && <p className="p-3 text-sm text-muted">Loading cited places…</p>}
          {context.error && <button className={action} onClick={context.retry}>Passage map unavailable · Retry</button>}
          {person.error && <button className={action} onClick={person.retry}>Person map unavailable · Retry</button>}
          {target && scoped.length > 0 && !hasLocatedPlace && <p className="p-3 text-sm text-muted">
            {scoped.length === 1 ? 'This place has no recorded coordinates.' : 'These places have no recorded coordinates.'}
          </p>}
          {target && catalog.data && scopedEmpty && (personId != null || context.data?.status === 'available' || context.data?.status === 'partial') &&
            <p className="p-3 text-sm text-muted">{personId == null ? 'No places are linked to these verses in the atlas.' :
              person.data ? 'No documented location with a supporting passage is recorded for this person.' : 'This person could not be found.'}</p>}
        </div>}
    </aside>
    <main className="flex-1 min-w-0 flex flex-col">
      <AtlasCanvas places={visible} focus={focus} overview={target ? scoped : null} selected={selected} onSelect={select} stops={stops} segments={connect ? segments : []} regions={activeRegions} />
      <div className="border-t border-line px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showRegions} onChange={e => setShowRegions(e.target.checked)} />Kingdom boundaries</label>
        {showRegions && <>
          <input aria-label="Year for kingdom boundaries" type="range" min={-2100} max={134} step={1} value={sliderFromYear(year)} onChange={e => setYear(yearFromSlider(Number(e.target.value)))} />
          <span>{year < 0 ? -year + ' BC' : year + ' AD'}</span>
          <span>Hand-drawn, approximate boundaries. {activeRegions.length ? activeRegions.map(r => r.name).join(' · ') : 'No overlay for this year.'}</span>
          {kingdomShapes.error && <button className={action} onClick={kingdomShapes.retry}>Boundary data unavailable · Retry</button>}
        </>}
      </div>
      {selected && <PlaceEvidence key={selected.id} place={selected} edition={citationEdition} />}
    </main>
  </div>
}
