// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MapsView from '../src/renderer/src/components/MapsView'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import { cameraBounds, fitPlaces, homeCamera, project, yearFromSlider, sliderFromYear, zoomAt } from '../src/shared/atlas'
import type { PlaceItem } from '../src/shared/types'

const place = (id: number, name: string, lat: number | null, lon: number | null, extra: Partial<PlaceItem> = {}): PlaceItem =>
  ({ id, name, lat, lon, featureType: 'City', aliases: [], precision: null, ambiguous: false, firstRef: null,
    identificationNote: null, comment: null, verseCount: 1, startYear: null, endYear: null, ...extra })
const rome = place(1, 'Rome', 41.9, 12.5)
const nod = place(2, 'Nod', null, null, { firstRef: 'Gen.4.16', featureType: 'Region' })
const adria = place(3, 'Adria', 42, 16, { aliases: ['Adriatic Sea'], featureType: 'Water' })
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.assign(window, { api: {
    getPlaces: async () => [rome, nod, adria], getMapRegions: async () => null,
    getMapLand: async () => '{"features":[]}', getPlaceVerses: async (id: number) => id === nod.id ? ['Gen.4.16'] : [],
    getPeople: async () => [], getPersonMap: async () => null
  } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label))!
it('centers a Timeline place outside the opening frame, then opens an unlocated record with its references', async () => {
  useAppStore.getState().focusPlace(rome.id)
  await act(async () => root.render(createElement(MapsView)))
  const [x, y, w, h] = host.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number)
  expect(x + w / 2).toBeCloseTo(project(rome.lon!, rome.lat!).x)
  expect(y + h / 2).toBeCloseTo(-rome.lat!)
  await act(async () => useAppStore.getState().focusPlace(nod.id))
  expect(host.querySelector('[aria-label="Place details"]')!.textContent).toContain('Location unknown')
  expect(button('Genesis 4:16')).toBeTruthy()
  expect(host.querySelector('svg')!.textContent).not.toContain('Nod')
})
it('finds an alias for an areal place and reveals it when selected', async () => {
  await act(async () => root.render(createElement(MapsView)))
  const input = host.querySelector('input[aria-label="Search places and aliases"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Adriatic Sea')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(host.querySelector('aside')!.textContent).not.toContain('Rome')
  await act(async () => button('Adria').click())
  expect(host.querySelector('[aria-label="Place details"]')!.textContent).toContain('Approximate area')
  expect(host.querySelector('svg')!.textContent).toContain('Adria')
})
it('shows numbered stops before drawing an optional connector, and preserves uncited gaps', async () => {
  const cities = [place(10, 'Paphos', 34.7, 32.4), place(11, 'Perga', 36.9, 30.8),
    place(12, 'Antioch (Pisidia)', 38.3, 31.2), place(13, 'Elsewhere', 40, 12)]
  const orders = [1, 2, 3, 5]
  const stops = cities.map((p, i) => ({ placeId: p.id, order: orders[i], journey: 'Acts 13', role: 'visit',
    source: 'Acts', label: p.name, refs: ['Acts.13.13'] }))
  Object.assign(window.api, { getPlaces: async () => cities, getPersonMap: async () => ({ personId: 25, name: 'Paul', stops }) })
  useAppStore.getState().openPersonMap(25)
  await act(async () => root.render(createElement(MapsView)))
  expect(button('3. Antioch (Pisidia)')).toBeTruthy()
  expect(host.querySelectorAll('svg line')).toHaveLength(0)
  await act(async () => (host.querySelector('aside input[type="checkbox"]') as HTMLInputElement).click())
  expect(host.querySelectorAll('svg line')).toHaveLength(2)
})
it('fits a passage to a wide or narrow frame and keeps the zoom anchor stationary', () => {
  for (const frame of [{ width: 400, height: 800 }, { width: 1200, height: 400 }]) {
    const camera = fitPlaces([rome, adria, nod], frame)
    const fit = cameraBounds(camera, frame)
    for (const p of [rome, adria]) {
      const point = project(p.lon!, p.lat!)
      expect(point.x).toBeGreaterThan(fit.x)
      expect(point.x).toBeLessThan(fit.x + fit.width)
      expect(point.y).toBeGreaterThan(fit.y)
      expect(point.y).toBeLessThan(fit.y + fit.height)
    }
    const anchor = { x: -0.35, y: 0.24 }
    const after = zoomAt(homeCamera, frame, anchor, 2)
    const a = cameraBounds(homeCamera, frame), b = cameraBounds(after, frame)
    expect(after.x + anchor.x * b.width).toBeCloseTo(homeCamera.x + anchor.x * a.width)
    expect(after.y + anchor.y * b.height).toBeCloseTo(homeCamera.y + anchor.y * a.height)
  }
  expect([-1, 0, 1].map(yearFromSlider)).toEqual([-1, 1, 2])
  expect(sliderFromYear(0)).toBe(sliderFromYear(1))
})
it('shows passage citations in native edition numbering and restores the passage when returning', async () => {
  Object.assign(window.api, { getPassageContext: async () => ({
    status: 'available', places: [{ id: rome.id, name: 'Rome', role: 'mentioned', settingRefs: [], refs: ['Rom.16.25'] }],
    people: [], events: []
  }) })
  useAppStore.setState({ primary: 'WEB', parallels: ['WEB', 'KJV'] })
  useAppStore.getState().openPassageMap({ edition: 'WEB', book: 'Rom', chapter: 14, firstVerse: 24 })
  await act(async () => root.render(createElement(MapsView)))
  expect(button('Romans 14:24')).toBeTruthy()
  await act(async () => button('Back to passage').click())
  expect(useAppStore.getState()).toMatchObject({ activity: 'bible', book: 'Rom', referenceEdition: 'WEB',
    chapter: 14, activeVerse: 24, parallels: ['WEB', 'KJV'] })
})
