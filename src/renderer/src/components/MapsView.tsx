import { useEffect, useMemo, useState } from 'react'
import type { PlaceItem } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { SearchIcon } from './icons'
import VerseRefs from './VerseRefs'

// Equirectangular projection over the biblical world (a first offline map; a Natural Earth basemap
// can be layered under this later).
const LON0 = 24
const LON1 = 52
const LAT0 = 24
const LAT1 = 42
const W = 800
const H = ((LAT1 - LAT0) / (LON1 - LON0)) * W
const x = (lon: number): number => ((lon - LON0) / (LON1 - LON0)) * W
const y = (lat: number): number => (1 - (lat - LAT0) / (LAT1 - LAT0)) * H

interface Geo {
  features?: { geometry?: { type: string; coordinates: unknown } }[]
}
/** Project Natural Earth land rings that touch our view into SVG path strings. */
function landPaths(geo: Geo): string[] {
  const out: string[] = []
  const ring = (r: number[][]): void => {
    let a = Infinity
    let b = -Infinity
    let c = Infinity
    let e = -Infinity
    for (const [lo, la] of r) {
      if (lo < a) a = lo
      if (lo > b) b = lo
      if (la < c) c = la
      if (la > e) e = la
    }
    if (b < LON0 - 3 || a > LON1 + 3 || e < LAT0 - 3 || c > LAT1 + 3) return // off-view
    let path = ''
    for (let i = 0; i < r.length; i++) {
      const [lo, la] = r[i]
      path += (i ? 'L' : 'M') + x(lo).toFixed(1) + ',' + y(la).toFixed(1)
    }
    out.push(path + 'Z')
  }
  for (const f of geo.features ?? []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') for (const r of g.coordinates as number[][][]) ring(r)
    else if (g.type === 'MultiPolygon')
      for (const poly of g.coordinates as number[][][][]) for (const r of poly) ring(r)
  }
  return out
}

/** Maps: the places of Scripture plotted by coordinates; click one for the verses that mention it. */
export default function MapsView(): JSX.Element {
  const [places, setPlaces] = useState<PlaceItem[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<PlaceItem | null>(null)
  const [verses, setVerses] = useState<string[]>([])
  const [land, setLand] = useState<string[]>([])
  const focusPlaceId = useAppStore((s) => s.focusPlaceId)

  useEffect(() => {
    window.api
      .getMapLand()
      .then((t) => {
        if (t) setLand(landPaths(JSON.parse(t) as Geo))
      })
      .catch(() => setLand([]))
  }, [])
  const clearFocus = useAppStore((s) => s.clearFocus)

  useEffect(() => {
    window.api
      .getPlaces()
      .then(setPlaces)
      .catch(() => setPlaces([]))
  }, [])

  // Arriving from another view (e.g. a Timeline location) selects that place once loaded.
  useEffect(() => {
    if (focusPlaceId == null || !places.length) return
    const p = places.find((x) => x.id === focusPlaceId)
    if (p) {
      setSel(p)
      clearFocus()
    }
  }, [focusPlaceId, places, clearFocus])
  useEffect(() => {
    if (!sel) return setVerses([])
    window.api
      .getPlaceVerses(sel.id)
      .then(setVerses)
      .catch(() => setVerses([]))
  }, [sel])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? places.filter((p) => p.name.toLowerCase().includes(s)) : places
  }, [places, q])
  const inBox = (p: PlaceItem): boolean =>
    p.lon >= LON0 && p.lon <= LON1 && p.lat >= LAT0 && p.lat <= LAT1
  const plotted = filtered.filter(inBox)

  const gridLon: number[] = []
  for (let l = LON0; l <= LON1; l += 4) gridLon.push(l)
  const gridLat: number[] = []
  for (let l = LAT0; l <= LAT1; l += 4) gridLat.push(l)

  return (
    <div className="h-full flex bg-bg">
      <div className="w-72 shrink-0 border-r border-line flex flex-col bg-panel">
        <div className="p-3 border-b border-line">
          <h2 className="font-serif text-lg text-ink mb-2">Places</h2>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a place…"
              className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink outline-none focus:border-accent placeholder:text-faint"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.slice(0, 500).map((p) => (
            <button
              key={p.id}
              onClick={() => setSel(p)}
              className={`w-full text-left px-3 py-1.5 border-b border-line/40 hover:bg-elevated ${
                sel?.id === p.id ? 'bg-accent-soft' : ''
              }`}
            >
              <div className="text-sm text-ink">{p.name}</div>
              <div className="text-xs text-faint">
                {p.featureType ?? 'place'}
                {p.verseCount ? ` · ${p.verseCount} verses` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full rounded-lg">
            <rect x={0} y={0} width={W} height={H} className="fill-sky-100 dark:fill-slate-800" />
            {land.map((d, i) => (
              <path
                key={i}
                d={d}
                className="fill-stone-200 dark:fill-stone-700 stroke-stone-300 dark:stroke-stone-600"
                strokeWidth={0.5}
              />
            ))}
            {gridLon.map((l) => (
              <line key={`x${l}`} x1={x(l)} y1={0} x2={x(l)} y2={H} className="stroke-line/30" strokeWidth={0.5} />
            ))}
            {gridLat.map((l) => (
              <line key={`y${l}`} x1={0} y1={y(l)} x2={W} y2={y(l)} className="stroke-line/30" strokeWidth={0.5} />
            ))}
            {plotted.map((p) => (
              <circle
                key={p.id}
                cx={x(p.lon)}
                cy={y(p.lat)}
                r={sel?.id === p.id ? 5 : 2.4}
                onClick={() => setSel(p)}
                className={
                  sel?.id === p.id
                    ? 'fill-accent cursor-pointer'
                    : 'fill-accent/45 hover:fill-accent cursor-pointer'
                }
              >
                <title>{p.name}</title>
              </circle>
            ))}
            {sel && inBox(sel) && (
              <text x={x(sel.lon) + 7} y={y(sel.lat) + 3} className="fill-ink text-[11px]">
                {sel.name}
              </text>
            )}
          </svg>
        </div>
        <div className="shrink-0 border-t border-line p-4 min-h-[6rem]">
          {sel ? (
            <>
              <div className="text-sm font-medium text-ink">
                {sel.name}
                <span className="text-xs text-faint font-normal ml-2">
                  {sel.lat.toFixed(2)}°, {sel.lon.toFixed(2)}° · {sel.featureType ?? 'place'}
                </span>
              </div>
              <div className="mt-2">
                {verses.length ? (
                  <VerseRefs refs={verses} limit={40} />
                ) : (
                  <span className="text-xs text-faint">No verse references.</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Click a point (or a place in the list) to see the verses that mention it. Only places
              within the biblical world are plotted.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
