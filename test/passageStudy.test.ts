import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { bibleDb } from '../src/main/db/bible'
import { readPassageContext, getPersonMap } from '../src/main/db/passageStudy'
import { getReviewedSpeakers, getStudyStructures } from '../src/shared/passageStudy'
import { buildStudyIndex } from '../data-pipeline/studyIndex'
import { reviewedAssociations } from '../src/shared/reviewedPlaces'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

describe.skipIf(!existsSync('resources/bible.sqlite'))('cited study data', () => {
  it('resolves exact locations and verse-specific roles, including unlocated places', () => {
    const db = bibleDb()!
    const acts = readPassageContext(db, { edition: 'BSB', book: 'Acts', chapter: 13, firstVerse: 13, lastVerse: 14 })
    expect(acts.status).toBe('available')
    expect(acts.places.find(p => p.id === 936)).toMatchObject({
      role: 'setting', refs: ['Acts.13.13', 'Acts.13.14'], settingRefs: ['Acts.13.13']
    })
    expect(acts.places.find(p => p.id === 636)).toMatchObject({ role: 'mentioned', refs: ['Acts.13.13'] })
    expect(acts.places.find(p => p.id === 69)?.refs).toEqual(['Acts.13.14'])
    expect(acts.places.find(p => p.id === 68)).toBeUndefined()
    expect(acts.people.find(p => p.id === 2479)?.refs).toContain('Acts.13.13')
    expect(acts.events.some(e => e.refs.includes('Acts.13.13'))).toBe(true)
    const genesis = readPassageContext(db, { edition: 'KJV', book: 'Gen', chapter: 4, firstVerse: 16 })
    expect(genesis.places.find(p => p.name === 'Nod')?.refs).toEqual(['Gen.4.16'])
  })

  it('reads shifted and partial native coordinates and distinguishes unsupported reference systems', () => {
    const db = bibleDb()!
    expect(readPassageContext(db, { edition: 'LXX', book: 'Ps', chapter: 50, firstVerse: 3 }))
      .toEqual(readPassageContext(db, { edition: 'KJV', book: 'Ps', chapter: 51, firstVerse: 1 }))
    expect(readPassageContext(db, { edition: 'LXX', book: 'Ps', chapter: 151, firstVerse: 1 }).status).toBe('unmapped')
    expect(readPassageContext(db, { edition: 'MT', book: 'Ps', chapter: 23, firstVerse: 0, lastVerse: 1 }).status).toBe('partial')
    expect(readPassageContext(db, { edition: 'TNT', book: 'Gen', chapter: 4, firstVerse: 16 }).status).toBe('unavailable')
    expect(readPassageContext(db, { edition: 'imp_example', book: 'Gen', chapter: 4 }).status).toBe('unverified')
  })

  it('keeps explicit routes separate for each traveler and from independent biographical facts', () => {
    const paul = getPersonMap(2479)!
    const pisidia = paul.stops.find(s => s.placeId === 919 && s.refs.includes('Acts.13.13'))!.journey
    expect(pisidia).toBeTruthy()
    expect(paul.stops.filter(s => s.journey === pisidia).map(s => [s.placeId, s.order])).toEqual([[919, 1], [936, 2], [69, 3]])
    expect(paul.stops.find(s => s.placeId === 1140)).toMatchObject({ role: 'birthplace', order: null })
    expect(getPersonMap(1722)?.stops.filter(s => s.journey === pisidia).map(s => s.placeId)).toEqual([919, 936, 69])
    const john = getPersonMap(1679)!
    expect(john.stops.filter(s => s.order).map(s => [s.placeId, s.order])).toEqual([[936, 1], [636, 2]])
    expect(john.stops[1].refs).toContain('Acts.13.13')
    for (const id of [2147, 2450]) expect(getPersonMap(id)?.stops.filter(s => s.order).map(s => s.placeId)).toEqual([815, 218])
    expect(getPersonMap(2147)?.stops.filter(s => s.placeId === 815).map(s => [s.role, s.order]))
      .toEqual([['departure', 1], ['residence', null]])
    expect(getPersonMap(2478)?.stops.map(s => s.placeId)).toEqual([837]) // King Saul has his own evidence.
    expect(getPersonMap(13)?.stops).toEqual([]) // No reviewed location for Abel.
    expect(getPersonMap(-9)).toBeNull()
  })

  it('distinguishes documented origins and residences from a birthplace or a burial', () => {
    expect(getPersonMap(279)?.stops.find(s => s.placeId === 956)).toMatchObject({ role: 'origin', refs: ['Acts.18.2'] })
    const adam = getPersonMap(78)!.stops.filter(s => s.placeId === 354)
    expect(adam.some(s => s.role === 'residence')).toBe(true)
    expect(adam.some(s => s.role === 'birthplace')).toBe(false)
    expect(bibleDb()!.prepare('SELECT lat,lon FROM places WHERE id=354').get()).toMatchObject({ lat: null, lon: null })
    const joshua = getPersonMap(1727)!.stops.filter(s => s.placeId === 1167)
    expect(joshua.some(s => s.role === 'residence')).toBe(true)
    expect(joshua.some(s => s.role === 'death')).toBe(false)
    expect(getPersonMap(994)?.stops.map(s => [s.placeId, s.role, s.order]))
      .toEqual(expect.arrayContaining([[551, 'visit', null], [636, 'residence', null]]))
  })

  it('uses the named children of David in each birthplace list and keeps similarly named sons distinct', () => {
    const children = bibleDb()!.prepare('SELECT id FROM people WHERE father_id=994').all()
    const bornAt = (placeId: number) => children.map(child => Number(child.id)).filter(id =>
      getPersonMap(id)?.stops.some(s => s.placeId === placeId && s.role === 'birthplace')
    ).sort((a, b) => a - b)
    expect(bornAt(551)).toEqual([59, 97, 232, 655, 939, 2657])
    expect(bornAt(636)).toEqual([728, 1078, 1143, 1148, 1156, 1163, 1584, 2152, 2179, 2213, 2547, 2715, 2762])
    expect(getPersonMap(1148)?.stops[0].refs).toContain('1Chr.14.5') // Elpalet
    expect(getPersonMap(1143)?.stops[0].refs).toContain('1Chr.14.7') // Eliphalet
  })

  it('indexes every source association and validates the reviewed citations against the bundled text', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const sandbox = new DatabaseSync(':memory:')
    try {
      sandbox.exec("ATTACH 'file:resources/bible.sqlite?mode=ro' AS bundled")
      sandbox.exec('CREATE TABLE study_references(ref TEXT,kind TEXT,entity_id INTEGER,PRIMARY KEY(ref,kind,entity_id)) WITHOUT ROWID')
      buildStudyIndex(sandbox)
      for (const [kind, table] of [['person', 'people'], ['place', 'places'], ['event', 'events']]) {
        const count = sandbox.prepare(`SELECT sum(json_array_length(verses)) n FROM bundled.${table}`).get()!.n
        expect(sandbox.prepare('SELECT count(*) n FROM main.study_references WHERE kind=?').get(kind)!.n).toBe(count)
      }
      expect(reviewedAssociations.every(a => a.refs.length > 0)).toBe(true)
      const indexed = readPassageContext(sandbox, { edition: 'KJV', book: 'Ruth', chapter: 1, firstVerse: 22 })
      expect(indexed.places.map(p => [p.id, p.role])).toContainEqual([815, 'mentioned'])
      expect(indexed.places.map(p => [p.id, p.role])).toContainEqual([218, 'setting'])
    } finally { sandbox.close() }
  })
})

it('supplies cited editorial examples while skipping unverified imports', () => {
  expect(getStudyStructures('BSB', 'Matt', 1)[0].rows.at(-1)).toMatchObject({ firstVerse: 17, lastVerse: 17 })
  expect(getStudyStructures('KJV', 'Acts', 15)[0].rows[0].firstVerse).toBe(23)
  expect(getReviewedSpeakers('BSB', 'Acts', 15, 15)[0].refs).toContain('Amos.9.11')
  expect(getReviewedSpeakers('imp_example', 'Acts', 15, 15)).toEqual([])
  expect(getStudyStructures('imp_example', 'Matt', 1)).toEqual([])
})
