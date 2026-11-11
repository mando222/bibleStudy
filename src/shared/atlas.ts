import type { PlaceItem } from './types'
import type { PersonMapStop } from './passageStudy'
import { isArealFeature } from './mapFeatures'

type Point = { x: number; y: number }
export type Camera = Point & { zoom: number }
export type Frame = { width: number; height: number }
export type Bounds = Point & Frame
export type LocatedPlace = PlaceItem & { lat: number; lon: number }

// Equirectangular projection with longitude scaled for the latitude of the opening view.
const longitudeScale = Math.cos(33 * Math.PI / 180)
const homeWidth = 28 * longitudeScale
const homeHeight = 18
export const project = (lon: number, lat: number): Point => ({ x: lon * longitudeScale, y: -lat })
export const homeCamera: Camera = { ...project(38, 33), zoom: 1 }
export const located = (place: PlaceItem): place is LocatedPlace =>
  place.precision !== 'Unlocated' && place.lat != null && place.lon != null &&
  Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180

export type JourneySegment = { key: string; from: LocatedPlace; to: LocatedPlace }

/** Connect consecutive, located stops within the same documented journey. */
export function journeySegments(stops: readonly PersonMapStop[], places: ReadonlyMap<number, PlaceItem>): JourneySegment[] {
  const journeys = new Map<string, Map<number, LocatedPlace>>()
  for (const stop of stops) {
    const place = places.get(stop.placeId)
    if (stop.journey == null || stop.order == null || !place || !located(place)) continue
    const ordered = journeys.get(stop.journey) ?? new Map<number, LocatedPlace>()
    ordered.set(stop.order, place)
    journeys.set(stop.journey, ordered)
  }
  const segments: JourneySegment[] = []
  for (const [journey, ordered] of journeys) {
    for (const [order, from] of ordered) {
      const to = ordered.get(order + 1)
      if (to) segments.push({ key: journey + ':' + order, from, to })
    }
  }
  return segments
}

export function cameraBounds(camera: Camera, frame: Frame): Bounds {
  const aspect = frame.width / frame.height
  const width = Math.max(homeWidth, homeHeight * aspect) / camera.zoom
  const height = width / aspect
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height }
}

export function fitPlaces(places: PlaceItem[], frame: Frame): Camera {
  const points = places.filter(located).map(p => project(p.lon, p.lat))
  if (!points.length) return homeCamera
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const { width, height } = cameraBounds(homeCamera, frame)
  const zoom = Math.min(6, width / (1.4 * (x1 - x0)), height / (1.4 * (y1 - y0)))
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom: Math.max(0.05, zoom) }
}

export function boundedCamera(camera: Camera): Camera {
  return { x: Math.max(-180 * longitudeScale, Math.min(180 * longitudeScale, camera.x)),
    y: Math.max(-90, Math.min(90, camera.y)), zoom: camera.zoom }
}

// Anchor is the cursor's fraction of the rendered viewport, on either side of its center.
export function zoomAt(camera: Camera, frame: Frame, anchor: Point, factor: number): Camera {
  const zoom = Math.max(0.05, Math.min(40, camera.zoom * factor))
  const before = cameraBounds(camera, frame)
  const after = cameraBounds({ ...camera, zoom }, frame)
  return boundedCamera({
    zoom, x: camera.x + (before.width - after.width) * anchor.x,
    y: camera.y + (before.height - after.height) * anchor.y
  })
}

export type MapShape = { d: string; bounds: Bounds; name: string; from?: number; to?: number }
interface GeoFeature {
  geometry?: { type: string; coordinates: unknown }
  properties?: { name?: string; valid_from?: number; valid_to?: number }
}

export function mapShapes(geo: { features?: GeoFeature[] }): MapShape[] {
  const shapes: MapShape[] = []
  for (const feature of geo.features ?? []) {
    const geometry = feature.geometry
    const props = feature.properties
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) continue
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][]
    for (const rings of polygons) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      const d = rings.map(ring => ring.map(([lon, lat], i) => {
        const { x, y } = project(lon, lat)
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        return (i ? 'L' : 'M') + x.toFixed(4) + ',' + y.toFixed(4)
      }).join('') + 'Z').join('')
      if (Number.isFinite(x0)) shapes.push({ d, bounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        name: props?.name ?? '', from: props?.valid_from, to: props?.valid_to })
    }
  }
  return shapes
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export const yearFromSlider = (n: number): number => n < 0 ? n : n + 1
export const sliderFromYear = (year: number): number => year < 0 ? year : Math.max(0, year - 1)
export function locationKind(p: PlaceItem): 'unlocated' | 'area' | 'proposed' | 'point' {
  if (!located(p)) return 'unlocated'
  if (isArealFeature(p.featureType)) return 'area'
  if (p.precision && p.precision !== 'Precise') return 'proposed'
  if (/\b(?:guess|rough|uncertain|possibly|perhaps)\b/i.test(p.comment ?? '')) return 'proposed'
  return 'point'
}

export function locationLabel(p: PlaceItem): string {
  switch (locationKind(p)) {
    case 'unlocated': return 'Location unknown'
    case 'area': return 'Approximate area'
    case 'proposed': return 'Proposed location'
    case 'point': return p.precision === 'Precise' ? 'Located site' : 'Recorded location · precision unspecified'
  }
}

export const placeMatches = (p: PlaceItem, query: string): boolean =>
  [p.name, ...p.aliases].some(name => name.toLowerCase().includes(query.trim().toLowerCase()))

// Reviewed geographical qualifiers for identically named records whose source labels omit them.
export function regionQualifier(p: PlaceItem): string | null {
  if (p.name !== 'Bethlehem') return null
  if (p.id === 218 && p.firstRef === 'Gen.35.19') return 'Judah' // Ruth 1:1
  if (p.id === 219 && p.firstRef === 'Josh.19.15') return 'Zebulun' // Joshua 19:10–16
  return null
}
