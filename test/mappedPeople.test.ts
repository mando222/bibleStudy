import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it, vi } from 'vitest'
import * as bible from '../src/main/db/bible'
import { getPeople, getPeoplePage, getPerson } from '../src/main/db/graph'
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

it.skipIf(!existsSync('resources/bible.sqlite'))('pages the whole People directory and finds documented aliases and namesakes', () => {
  const first = getPeoplePage('', 800, 0)
  const all = [...first.people]
  for (let offset = 800; offset < first.total; offset += 800) all.push(...getPeoplePage('', 800, offset).people)
  expect(new Set(all.map(p => p.id)).size).toBe(first.total)
  expect(first.total).toBe(3067)
  expect(getPeoplePage('Saul', 80, 0).people.find(p => p.id === 2479)?.displayName).toContain('Paul')
  expect(getPeoplePage('Zechariah', 80, 0).people.filter(p => p.name === 'Zechariah').every(p => p.firstRef)).toBe(true)
  const philips = getPeoplePage('Philip', 80, 0).people
  expect(philips.find(p => p.id === 2345)?.displayName).toBe('Philip (husband of Herodias)')
  expect(philips.find(p => p.id === 2346)?.displayName).toBe('Philip (tetrarch of Ituraea)')
  const azariahs = getPeoplePage('Azariah', 80, 0).people
  expect(azariahs.find(p => p.id === 381)?.displayName).toBe('Azariah (catalog 381)')
  expect(azariahs.find(p => p.id === 382)?.displayName).toBe('Azariah (catalog 382)')
  expect(getPeoplePage('%', 1, 0).total).toBe(0)
})

it.skipIf(!existsSync('resources/bible.sqlite'))('groups Jacob’s children by recorded mother and distinguishes full and half siblings', () => {
  const jacob = getPerson(682)!
  const groups = (mother: string) => jacob.children.filter(c => c.mother?.name === mother).map(c => c.name)
  expect(groups('Rachel')).toEqual(['Benjamin', 'Joseph'])
  expect(groups('Bilhah')).toEqual(['Dan', 'Naphtali'])
  expect(groups('Zilpah')).toEqual(['Asher', 'Gad'])
  expect(groups('Leah')).toEqual(['Dinah', 'Issachar', 'Judah', 'Levi', 'Reuben', 'Simeon', 'Zebulun'])
  expect(jacob.children.find(c => c.name === 'Dinah')?.motherRefs).toEqual(['Gen.30.21'])
  const joseph = getPerson(1710)!
  expect(joseph.siblings.filter(s => s.relation === 'both')).toEqual([{ id: 463, name: 'Benjamin', relation: 'both' }])
  expect(joseph.siblings.filter(s => s.relation === 'halfFather')).toHaveLength(11)
  expect(new Set(joseph.siblings.map(s => s.id)).size).toBe(12)
})

it.skipIf(!existsSync('resources/bible.sqlite'))('keeps unknown mothers, named siblings without parents, and unresolved parentage distinct', () => {
  const david = getPerson(994)!
  expect(david.children.find(c => c.id === 2822)).toMatchObject({ name: 'Tamar', mother: null, motherRefs: [] })
  expect(david.children.find(c => c.id === 2762)).toMatchObject({ name: 'Solomon', mother: { name: 'Bathsheba' }, motherRefs: ['1Chr.3.5'] })
  expect(getPerson(2822)?.siblings.find(s => s.id === 59)?.relation).toBe('father')
  for (const id of [1812, 1937, 1939]) {
    const family = getPerson(id)!
    expect(family.father).toBeNull()
    expect(family.mother).toBeNull()
    expect(family.siblings.map(s => s.id).sort()).toEqual([1812, 1937, 1939].filter(other => other !== id))
    expect(family.siblings.every(s => s.relation === 'recorded')).toBe(true)
  }
  // Col 4:10 identifies Mark as Barnabas’s cousin. It does not identify his mother Mary as Barnabas’s sister.
  expect(getPerson(1722)?.siblings.some(s => s.id === 1941)).toBe(false)
  expect(getPerson(905)?.siblings.map(s => s.relation)).toEqual(Array(4).fill('recorded'))
  expect(getPerson(1938)?.children.map(c => c.name)).toEqual(['Jesus'])
})
