import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { boundedCamera, cameraBounds, fitPlaces, homeCamera, intersects, located, locationKind, locationLabel, mapShapes, project, zoomAt } from '@shared/atlas'
import type { Camera, Frame, JourneySegment, MapShape } from '@shared/atlas'
import type { PlaceItem } from '@shared/types'
import type { PersonMapStop } from '@shared/passageStudy'
import { useStudyQuery } from '@/hooks/useStudyQuery'

interface Props {
  places: PlaceItem[]
  focus: PlaceItem[] | null
  overview: PlaceItem[] | null
  selected: PlaceItem | null
  onSelect: (place: PlaceItem) => void
  stops: PersonMapStop[]
  segments: JourneySegment[]
  regions: MapShape[]
}
const loadLand = async () => {
  const land = await window.api.getMapLand()
  if (!land) throw new Error('No bundled land data')
  return mapShapes(JSON.parse(land))
}

export default function AtlasCanvas({ places, focus, overview, selected, onSelect, stops, segments, regions }: Props): JSX.Element {
  const land = useStudyQuery(loadLand)
  const svg = useRef<SVGSVGElement>(null)
  const [frame, setFrame] = useState<Frame>({ width: 800, height: 600 })
  const frameRef = useRef(frame)
  const [camera, setCamera] = useState<Camera>(homeCamera)
  const drag = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null)
  const bounds = cameraBounds(camera, frame)
  const pixel = bounds.width / frame.width

  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const next = { width, height }
      frameRef.current = next
      setFrame(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    setCamera(focus ? fitPlaces(focus, frameRef.current) : homeCamera)
  }, [focus])

  const zoom = useCallback((factor: number, x = 0, y = 0) => {
    setCamera(c => zoomAt(c, frameRef.current, { x, y }, factor))
  }, [])
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (r.width && r.height) zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18,
        (e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoom])

  const numbered = useMemo(() => {
    const result = new Map<number, string[]>()
    for (const stop of stops) if (stop.order != null) {
      result.set(stop.placeId, [...(result.get(stop.placeId) ?? []), String(stop.order)])
    }
    return result
  }, [stops])
  const shown = places.filter(located).filter(p => {
    const pt = project(p.lon, p.lat)
    return intersects(bounds, { ...pt, width: 0, height: 0 })
  })

  return <div className="relative flex-1 min-h-32 overflow-hidden bg-sky-100 dark:bg-slate-800">
    <svg ref={svg} viewBox={[bounds.x, bounds.y, bounds.width, bounds.height].join(' ')}
      aria-label="Atlas map" className="block w-full h-full cursor-grab active:cursor-grabbing select-none touch-none"
      onPointerDown={e => {
        if (e.button !== 0) return
        drag.current = { x: e.clientX, y: e.clientY, camera, moved: false }
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d || !e.buttons) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (!d.moved && Math.hypot(dx, dy) < 3) return
        if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
        d.moved = true
        setCamera(boundedCamera({ ...d.camera, x: d.camera.x - dx * pixel, y: d.camera.y - dy * pixel }))
      }}
      onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }}
      onPointerCancel={() => { drag.current = null }}>
      {land.data?.map((shape, i) => intersects(bounds, shape.bounds) &&
        <path key={i} d={shape.d} fillRule="evenodd" className="fill-stone-200 dark:fill-stone-700 stroke-stone-400/60" strokeWidth={0.7 * pixel} />)}
      {regions.map((r, i) => <g key={i} className="pointer-events-none">
        <path d={r.d} className="fill-amber-400/20 stroke-amber-600/60" strokeWidth={pixel} />
        <text x={r.bounds.x + r.bounds.width / 2} y={r.bounds.y + r.bounds.height / 2}
          fontSize={11 * pixel} textAnchor="middle" className="fill-amber-800 dark:fill-amber-300">{r.name}</text>
      </g>)}
      {segments.map(({ key, from, to }) => {
        const a = project(from.lon, from.lat), b = project(to.lon, to.lat)
        return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-accent pointer-events-none"
          strokeDasharray={3 * pixel + ' ' + 4 * pixel} strokeWidth={1.7 * pixel} />
      })}
      {shown.map(p => {
        const { x, y } = project(p.lon, p.lat)
        const order = numbered.get(p.id)?.join('/')
        const active = p.id === selected?.id
        const radius = (order ? 9 : active ? 5 : 3) * pixel
        const kind = locationKind(p)
        return <g key={p.id} transform={'translate(' + x + ' ' + y + ')'} className="cursor-pointer"
          onClick={() => { if (!drag.current?.moved) onSelect(p) }}>
          <title>{p.name} · {locationLabel(p)}</title>
          {kind === 'proposed'
            ? <path d={`M0 ${-radius * 1.3} L${radius * 1.3} 0 L0 ${radius * 1.3} L${-radius * 1.3} 0 Z`}
                className="fill-amber-100 stroke-amber-700 dark:fill-stone-700 dark:stroke-amber-400" strokeWidth={1.3 * pixel} />
            : <circle r={radius} className={kind === 'area' ? 'stroke-accent fill-panel/80' : active || order ? 'fill-accent stroke-accent' : 'fill-accent/55 stroke-transparent'} strokeWidth={1.6 * pixel} />}
          {order && <text fontSize={10 * pixel} textAnchor="middle" dominantBaseline="central"
            className={kind === 'point' ? 'fill-white' : 'fill-ink'}>{order}</text>}
        </g>
      })}
      {selected && located(selected) && <text x={project(selected.lon, selected.lat).x + 12 * pixel}
        y={project(selected.lon, selected.lat).y - 6 * pixel} fontSize={13 * pixel}
        className="fill-ink stroke-panel pointer-events-none" strokeWidth={3 * pixel} paintOrder="stroke">{selected.name}</text>}
    </svg>
    <div className="absolute top-3 right-3 flex gap-1">
      {[{ title: 'Zoom in', label: '+', click: () => zoom(1.4) },
        { title: 'Zoom out', label: '−', click: () => zoom(1 / 1.4) },
        { title: overview ? 'Fit mapped places' : 'Reset to Near East', label: '⌂',
          click: () => setCamera(overview ? fitPlaces(overview, frameRef.current) : homeCamera) }].map(b =>
        <button key={b.title} title={b.title} aria-label={b.title} onClick={b.click}
          className="w-8 h-8 rounded border border-line bg-panel shadow-sm hover:text-accent">{b.label}</button>)}
    </div>
    <div className="absolute bottom-2 left-2 rounded bg-panel/90 px-2 py-1 text-[11px] text-muted">
      {land.error ? <button onClick={land.retry}>Basemap unavailable · Retry</button> :
        shown.length + ' mapped here · ○ area · ◇ proposed site'}
    </div>
  </div>
}
