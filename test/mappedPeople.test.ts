import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it, vi } from 'vitest'
import * as bible from '../src/main/db/bible'
import { getPeople, getPerson } from '../src/main/db/graph'
import { getMappedPeople, getPersonMap } from '../src/main/db/passageStudy'
import { reviewedAssociations } from '../src/shared/reviewedPlaces'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

it.skipIf(!existsSync('resources/bible.sqlite'))('lists exactly the people with cited places, keeping the full Family directory', () => {
  const people = getMappedPeople()
  const reviewedIds = new Set(reviewedAssociations.flatMap(association => association.people))
  expect(new Set(people.map(person => person.id))).toEqual(reviewedIds)
  expect(people).toHaveLength(reviewedIds.size)
  for (const { id, displayName, mappedPlaceCount } of people) {
    const map = getPersonMap(id)!
    expect(map.displayName).toBe(displayName)
    expect(map.stops.every(stop => stop.refs.length > 0)).toBe(true)
    expect(mappedPlaceCount).toBeGreaterThan(0)
    expect(mappedPlaceCount).toBe(new Set(map.stops.map(stop => stop.placeId)).size)
    expect(getPerson(id)?.mappedPlaceCount).toBe(mappedPlaceCount)
  }
  expect(getPeople('Abel').some(person => person.id === 13)).toBe(true)
  expect(getPerson(13)?.mappedPlaceCount).toBe(0)
  expect(getPersonMap(13)?.stops).toEqual([])
  expect(people.some(person => person.id === 13)).toBe(false)
})

it.skipIf(!existsSync('resources/bible.sqlite'))('distinguishes namesakes and preserves alternate biblical names in atlas search', () => {
  const people = getMappedPeople()
  const display = (id: number) => people.find(person => person.id === id)?.displayName
  expect(display(939)).toBe('Daniel (son of David)')
  expect(display(2152)).toBe('Nathan (son of David)')
  expect(display(1710)).toBe('Joseph (son of Jacob)')
  expect(display(1679)).toBe('John Mark')
  expect(display(682)).toBe('Jacob (Israel)')
  expect(display(2479)).toContain('Saul')
  expect(display(2478)).toContain('Kish')
  expect(display(1148)).toContain('3:6')
  expect(display(1143)).toContain('3:8')
  expect(people.filter(person => person.aliases.includes('Eliphelet')).map(person => person.id).sort())
    .toEqual([1143, 1148])
})

it('retains an unlocated place with evidence and excludes a place absent from the catalog', () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(':memory:')
  const active = vi.spyOn(bible, 'bibleDb').mockReturnValue(db)
  try {
    db.exec(`
      CREATE TABLE people(id INTEGER PRIMARY KEY, name TEXT, gender TEXT, father_id INTEGER);
      CREATE TABLE places(id INTEGER PRIMARY KEY, lat REAL, lon REAL);
      INSERT INTO people(id,name) VALUES (2479, 'Paul'), (2147, 'Naomi'), (13, 'Abel');
      INSERT INTO places VALUES (919, NULL, NULL);
    `)
    expect(getMappedPeople()).toMatchObject([{ id: 2479, name: 'Paul', mappedPlaceCount: 1 }])
    expect(getPersonMap(2479)?.stops.map(stop => stop.placeId)).toEqual([919])
    expect(getPersonMap(2147)?.stops).toEqual([])
    expect(getPersonMap(-1)).toBeNull()
  } finally {
    active.mockRestore()
    db.close()
  }
})
