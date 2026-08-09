import { useEffect, useMemo, useRef, useState } from 'react'
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

interface View {
  scale: number
  tx: number
  ty: number
}
/** Keep the view within bounds: scale ≥ 1, and the content always covering the frame. */
function clampView(v: View): View {
  const scale = Math.min(14, Math.max(1, v.scale))
  return {
    scale,
    tx: Math.min(0, Math.max(W - scale * W, v.tx)),
    ty: Math.min(0, Math.max(H - scale * H, v.ty))
  }
}

/** Maps: the places of Scripture plotted by coordinates; click one for the verses that mention it. */
export default function MapsView(): JSX.Element {
  const [places, setPlaces] = useState<PlaceItem[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<PlaceItem | null>(null)
  const [verses, setVerses] = useState<string[]>([])
  const [land, setLand] = useState<string[]>([])
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const [ftype, setFtype] = useState('all')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
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

  const types = useMemo(
    () => [
      'all',
      ...Array.from(new Set(places.map((p) => p.featureType).filter(Boolean) as string[])).sort()
    ],
    [places]
  )
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return places.filter(
      (p) =>
        (!s || p.name.toLowerCase().includes(s)) && (ftype === 'all' || p.featureType === ftype)
    )
  }, [places, q, ftype])
  const inBox = (p: PlaceItem): boolean =>
    p.lon >= LON0 && p.lon <= LON1 && p.lat >= LAT0 && p.lat <= LAT1
  const plotted = filtered.filter(inBox)

  // Pan & zoom
  const ptr = (e: { clientX: number; clientY: number }): { px: number; py: number } => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { px: W / 2, py: H / 2 }
    return { px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H }
  }
  const zoomAbout = (px: number, py: number, factor: number): void =>
    setView((v) => {
      const scale = Math.min(14, Math.max(1, v.scale * factor))
      const k = scale / v.scale
      return clampView({ scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k })
    })
  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    const { px, py } = ptr(e)
    zoomAbout(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }
  const onDown = (e: React.MouseEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  }
  const onMove = (e: React.MouseEvent): void => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!drag.current || !r) return
    const dx = ((e.clientX - drag.current.x) / r.width) * W
    const dy = ((e.clientY - drag.current.y) / r.height) * H
    setView(clampView({ scale: view.scale, tx: drag.current.tx + dx, ty: drag.current.ty + dy }))
  }
  const onUp = (): void => {
    drag.current = null
  }
  const s = view.scale

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
          <select
            value={ftype}
            onChange={(e) => setFtype(e.target.value)}
            className="mt-2 w-full bg-elevated border border-line rounded-md text-xs px-2 py-1 text-muted outline-none focus:border-accent"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t}
              </option>
            ))}
          </select>
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
        <div className="flex-1 min-h-0 p-4 relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            onWheel={onWheel}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            className="w-full h-full rounded-lg cursor-grab active:cursor-grabbing select-none"
          >
            <rect x={0} y={0} width={W} height={H} className="fill-sky-100 dark:fill-slate-800" />
            <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
              {land.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  className="fill-stone-200 dark:fill-stone-700 stroke-stone-300 dark:stroke-stone-600"
                  strokeWidth={0.5 / s}
                />
              ))}
              {gridLon.map((l) => (
                <line key={`x${l}`} x1={x(l)} y1={0} x2={x(l)} y2={H} className="stroke-line/30" strokeWidth={0.5 / s} />
              ))}
              {gridLat.map((l) => (
                <line key={`y${l}`} x1={0} y1={y(l)} x2={W} y2={y(l)} className="stroke-line/30" strokeWidth={0.5 / s} />
              ))}
              {plotted.map((p) => (
                <circle
                  key={p.id}
                  cx={x(p.lon)}
                  cy={y(p.lat)}
                  r={(sel?.id === p.id ? 5 : 2.4) / s}
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
                <text
                  x={x(sel.lon) + 7 / s}
                  y={y(sel.lat) + 3 / s}
                  style={{ fontSize: 11 / s }}
                  className="fill-ink"
                >
                  {sel.name}
                </text>
              )}
            </g>
          </svg>

          <div className="absolute top-6 right-6 flex flex-col gap-1">
            {[
              { label: '+', on: () => zoomAbout(W / 2, H / 2, 1.4), title: 'Zoom in' },
              { label: '−', on: () => zoomAbout(W / 2, H / 2, 1 / 1.4), title: 'Zoom out' },
              { label: '⤢', on: () => setView({ scale: 1, tx: 0, ty: 0 }), title: 'Reset view' }
            ].map((b) => (
              <button
                key={b.title}
                onClick={b.on}
                title={b.title}
                className="w-8 h-8 rounded-md border border-line bg-panel text-muted hover:text-accent hover:bg-elevated flex items-center justify-center text-base leading-none shadow-sm"
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="absolute bottom-6 left-6 text-[11px] text-faint bg-panel/70 rounded px-1.5 py-0.5">
            {plotted.length} places · drag to pan · scroll to zoom
          </div>
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
