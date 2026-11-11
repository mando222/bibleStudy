// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MapsView from '../src/renderer/src/components/MapsView'
import GenealogiesView from '../src/renderer/src/components/GenealogiesView'
import { useAppStore } from '../src/renderer/src/store/useAppStore'
import { cameraBounds, fitPlaces, homeCamera, project, yearFromSlider, sliderFromYear, zoomAt } from '../src/shared/atlas'
import type { PlaceItem, Translation } from '../src/shared/types'
import type { PersonMap } from '../src/shared/passageStudy'

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
    getMappedPeople: async () => [], getPeople: async () => [], getPersonMap: async () => null
  } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label))!

it('searches only people with cited places and keeps the picker open if a prior map arrives late', async () => {
  let finish!: (person: PersonMap) => void
  const pending = new Promise<PersonMap>(resolve => { finish = resolve })
  const roster = vi.fn(async () => [
    { id: 25, name: 'Paul', displayName: 'Paul', aliases: ['Saul'], mappedPlaceCount: 2 },
    { id: 45, name: 'Cain', displayName: 'Cain', aliases: [], mappedPlaceCount: 1 }
  ])
  const allPeople = vi.fn(async () => [{ id: 13, name: 'Abel', verseCount: 12 }])
  Object.assign(window.api, {
    getMappedPeople: roster, getPeople: allPeople,
    getPersonMap: (id: number) => id === 25 ? pending : Promise.resolve({ personId: id, name: 'Cain', displayName: 'Cain', stops: [{
      placeId: nod.id, role: 'residence', label: 'Lived in Nod', refs: ['Gen.4.16'], journey: null, order: null, source: 'Reviewed passage'
    }] })
  })
  useAppStore.setState({ activity: 'genealogies' })
  useAppStore.getState().openPersonMap(25)
  await act(async () => root.render(createElement(MapsView)))
  await act(async () => button('Map a person').click())
  await act(async () => finish({ personId: 25, name: 'Paul', displayName: 'Paul', stops: [] }))
  expect(host.querySelector('h2')?.textContent).toBe('People with documented locations')
  expect(button('Paul 2 documented locations')).toBeTruthy()
  expect(button('Cain 1 documented location')).toBeTruthy()
  const input = host.querySelector<HTMLInputElement>('input[placeholder="Person’s name"]')!
  async function search(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await search('Abel')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No people with documented locations')
  await search('Saul')
  expect(button('Paul 2 documented locations')).toBeTruthy()
  await search(' CaIN ')
  expect(button('Paul')).toBeUndefined()
  await act(async () => button('Cain').click())
  expect(host.querySelector('h2')?.textContent).toBe('Cain')
  expect(button('Nod')?.textContent).toContain('Location unknown')
  expect(button('Genesis 4:16')).toBeTruthy()
  expect(host.textContent).toContain('This place has no recorded coordinates.')
  expect(host.querySelector('svg')?.textContent).not.toContain('Nod')
  expect(roster).toHaveBeenCalledTimes(1)
  expect(allPeople).not.toHaveBeenCalled()
  await act(async () => button('All places').click())
  await act(async () => button('Back to profile').click())
  expect(useAppStore.getState()).toMatchObject({ activity: 'genealogies', focusPersonId: 25 })
})

it('keeps an unmapped person in Family and offers the map only on a supported profile', async () => {
  vi.useFakeTimers()
  try {
    const people = [{ id: 13, name: 'Abel', mappedPlaceCount: 0 }, { id: 25, name: 'Paul', mappedPlaceCount: 1 }]
    Object.assign(window.api, { getPeople: async () => people, getAncestry: async () => [],
      getPerson: async (id: number) => ({ ...people.find(p => p.id === id), spouses: [], children: [], verses: [] }) })
    useAppStore.setState({ activity: 'genealogies' })
    await act(async () => root.render(createElement(GenealogiesView)))
    await act(async () => vi.advanceTimersByTimeAsync(200))
    await act(async () => button('Abel').click())
    expect(host.querySelector('h1')?.textContent).toBe('Abel')
    expect(host.textContent).toContain('No documented location')
    expect(button('Map this person')).toBeUndefined()
    await act(async () => button('Paul').click())
    await act(async () => button('Map this person').click())
    expect(useAppStore.getState()).toMatchObject({ activity: 'maps', atlasTarget: { kind: 'person', personId: 25 } })
  } finally { vi.useRealTimers() }
})

it('opens person citations at the verse printed in the selected edition', async () => {
  Object.assign(window.api, { getPersonMap: async () => ({ personId: 25, name: 'Paul', displayName: 'Paul', stops: [{
    placeId: rome.id, journey: null, order: null, role: 'visit', label: 'Test location', source: 'Test citation', refs: ['Rom.16.25']
  }] }) })
  useAppStore.setState({ primary: 'WEB', referenceEdition: 'KJV', parallels: ['WEB', 'KJV'] })
  useAppStore.getState().openPersonMap(25)
  await act(async () => root.render(createElement(MapsView)))
  await act(async () => button('Romans 14:24').click())
  expect(useAppStore.getState()).toMatchObject({ activity: 'bible', book: 'Rom', referenceEdition: 'WEB', chapter: 14, activeVerse: 24 })
})

it('opens the labelled KJV citation when the reader uses an unverified import and keeps its parallel editions', async () => {
  const imported = 'imp_study'
  Object.assign(window.api, { getPersonMap: async () => ({ personId: 25, name: 'Paul', displayName: 'Paul', stops: [{
    placeId: rome.id, journey: null, order: null, role: 'visit', label: 'Arrival in Rome', source: 'Reviewed passage', refs: ['Acts.28.16']
  }] }) })
  useAppStore.setState({ primary: imported, parallels: [imported, 'BSB', 'KJV'], translations: [{ id: 'KJV' }, { id: imported }] as Translation[] })
  const s = useAppStore.getState()
  s.goToVerse('Acts', 28, 16, imported)
  expect(useAppStore.getState().primary).toBe(imported)
  s.openPersonMap(25)
  await act(async () => root.render(createElement(MapsView)))
  await act(async () => button('Acts 28:16 (KJV)').click())
  expect(useAppStore.getState()).toMatchObject({ activity: 'bible', primary: 'KJV', parallels: ['KJV', 'BSB', imported],
    book: 'Acts', chapter: 28, activeVerse: 16, referenceEdition: 'KJV' })
})
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

it('refits the person’s places and never offers a line across an unknown stop or between journeys', async () => {
  const stop = (p: PlaceItem, order: number, journey: string) => ({
    placeId: p.id, role: 'visit' as const, label: p.name, refs: ['Acts.13.13'], source: 'Test', order, journey
  })
  const stops = [stop(rome, 1, 'First journey'), stop(nod, 2, 'First journey'), stop(adria, 3, 'First journey'),
    stop(adria, 2, 'Second journey')]
  Object.assign(window.api, { getPersonMap: async () => ({ personId: 25, name: 'Traveler', stops }) })
  useAppStore.getState().openPersonMap(25)
  await act(async () => root.render(createElement(MapsView)))
  const map = host.querySelector('svg[aria-label="Atlas map"]')!
  const overview = map.getAttribute('viewBox')
  expect(button('2. Nod')).toBeTruthy()
  expect(host.querySelector('aside')!.textContent).not.toContain('Sequence only')
  await act(async () => button('1. Rome').click())
  expect(map.getAttribute('viewBox')).not.toBe(overview)
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Fit mapped places"]')!.click())
  expect(map.getAttribute('viewBox')).toBe(overview)
})
