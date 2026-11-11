import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { getPlaces, getPlaceVerses } from '../src/main/db/graph'
import { cameraBounds, fitPlaces, located, locationKind, placeMatches, project, regionQualifier } from '../src/shared/atlas'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

describe.skipIf(!existsSync('resources/bible.sqlite'))('bundled offline atlas', () => {
  it('keeps the complete catalog and can center on every geolocated record', () => {
    const places = getPlaces()
    expect(places).toHaveLength(1274)
    const sites = places.filter(located)
    expect(sites).toHaveLength(1252)
    const frame = { width: 900, height: 600 }
    for (const site of sites) {
      const view = cameraBounds(fitPlaces([site], frame), frame)
      const p = project(site.lon, site.lat)
      expect(Math.abs(view.x + view.width / 2 - p.x)).toBeLessThan(1e-8)
      expect(Math.abs(view.y + view.height / 2 - p.y)).toBeLessThan(1e-8)
    }
    const nod = places.find(p => p.name === 'Nod')!
    expect(locationKind(nod)).toBe('unlocated')
    expect(getPlaceVerses(nod.id)).toContain('Gen.4.16')
  })
  it('preserves identifiers, source uncertainty and alternate names', () => {
    const places = getPlaces()
    const guess = places.find(p => p.id === 94)!
    expect(locationKind(guess)).toBe('proposed')
    expect(guess.comment).toMatch(/guess/i)
    expect(places.filter(p => p.name === 'Hazor')).toHaveLength(5)
    expect(places.filter(p => p.name === 'Bethlehem').map(regionQualifier).sort()).toEqual(['Judah','Zebulun'])
    const adria = places.find(p => p.name === 'Adria')!
    expect(placeMatches(adria, 'adriatic sea')).toBe(true)
    expect(locationKind(adria)).toBe('area')
  })
})
