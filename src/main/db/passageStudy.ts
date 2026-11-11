import type { DatabaseSync } from 'node:sqlite'
import { bibleDb } from './bible'
import { getImportedChapter } from './user'
import { mapPassage } from '../../shared/passageMapping'
import { reviewedSettings, stopsForPerson } from '../../shared/reviewedPlaces'
import type {
  ContextEntity, ContextEvent, ContextPlace, PassageContext, PersonMap, StudyRange
} from '../../shared/passageStudy'

function empty(status: PassageContext['status']): PassageContext {
  return { status, people: [], places: [], events: [] }
}

function validRange(range: StudyRange): boolean {
  return !!range && typeof range.edition === 'string' && typeof range.book === 'string' &&
    Number.isSafeInteger(range.chapter) && range.chapter > 0 &&
    [range.firstVerse, range.lastVerse].every(v => v === undefined || (Number.isSafeInteger(v) && v >= 0)) &&
    (range.lastVerse === undefined || (range.firstVerse !== undefined && range.lastVerse >= range.firstVerse))
}

function verseNumbers(db: DatabaseSync, range: StudyRange): number[] {
  const original = ['NA', 'BYZ', 'TR'].includes(range.edition)
  const from = original ? 'original_tokens WHERE edition=?' : 'verses WHERE translation_id=?'
  const sql = `SELECT DISTINCT verse FROM ${from} AND book_id=? AND chapter=?
    AND verse BETWEEN ? AND ? ORDER BY verse`
  return db.prepare(sql).all(range.edition, range.book, range.chapter,
    range.firstVerse ?? 0, range.lastVerse ?? range.firstVerse ?? Number.MAX_SAFE_INTEGER
  ).map(row => Number(row.verse))
}

type LinkedRow = {
  kind: 'person' | 'place' | 'event'
  id: number
  name: string
  ref: string
  startYear: number | null
  endYear: number | null
}

function links(db: DatabaseSync, refs: string[]): LinkedRow[] {
  // The bundled DB contains the index. Earlier manually supplied DBs can still be read.
  const hasIndex = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='study_references'").get()
  const source = hasIndex ? 'study_references' : `(
    SELECT 'person' kind, people.id entity_id, v.value ref FROM people, json_each(people.verses) v
    UNION ALL SELECT 'place', places.id, v.value FROM places, json_each(places.verses) v
    UNION ALL SELECT 'event', events.id, v.value FROM events, json_each(events.verses) v)`
  return db.prepare(`SELECT s.kind, s.entity_id id, s.ref, coalesce(p.name, l.name, e.title) name,
      e.start_year startYear, e.end_year endYear
    FROM json_each(?) selection JOIN ${source} s ON s.ref=selection.value
    LEFT JOIN people p ON s.kind='person' AND p.id=s.entity_id
    LEFT JOIN places l ON s.kind='place' AND l.id=s.entity_id
    LEFT JOIN events e ON s.kind='event' AND e.id=s.entity_id
    ORDER BY selection.key, name, id`).all(JSON.stringify(refs)) as unknown as LinkedRow[]
}

/** Links use only the requested native verses that actually have an equivalent KJV verse. */
export function readPassageContext(db: DatabaseSync, range: StudyRange): PassageContext {
  if (!validRange(range)) return empty('unavailable')
  if (range.edition.startsWith('imp_')) return empty('unverified')
  const numbers = verseNumbers(db, range)
  if (!numbers.length) return empty('unavailable')
  const exists = db.prepare("SELECT 1 FROM verses WHERE translation_id='KJV' AND book_id=? AND chapter=? AND verse=?")
  const refs: string[] = []
  for (const verse of numbers) {
    const ref = mapPassage({ book: range.book, chapter: range.chapter, verse }, range.edition, 'KJV')
    if (ref && exists.get(ref.book, ref.chapter, ref.verse)) refs.push(`${ref.book}.${ref.chapter}.${ref.verse}`)
  }
  if (!refs.length) return empty('unmapped')
  const expected = range.firstVerse === undefined ? numbers.length : (range.lastVerse ?? range.firstVerse) - range.firstVerse + 1
  const status = refs.length < expected ? 'partial' : 'available'
  const people = new Map<number, ContextEntity>()
  const places = new Map<number, ContextPlace>()
  const events = new Map<number, ContextEvent>()
  for (const row of links(db, refs)) {
    const base = { id: row.id, name: row.name, refs: [] as string[] }
    if (row.kind === 'place') {
      const item: ContextPlace = places.get(row.id) ?? { ...base, role: 'mentioned', settingRefs: [] }
      item.refs.push(row.ref)
      if (reviewedSettings[row.ref]?.includes(row.id)) {
        item.role = 'setting'
        item.settingRefs.push(row.ref)
      }
      places.set(row.id, item)
    } else if (row.kind === 'person') {
      const item = people.get(row.id) ?? base
      item.refs.push(row.ref)
      people.set(row.id, item)
    } else {
      const item = events.get(row.id) ?? { ...base, startYear: row.startYear, endYear: row.endYear }
      item.refs.push(row.ref)
      events.set(row.id, item)
    }
  }
  return { status, people: [...people.values()], places: [...places.values()], events: [...events.values()] }
}

export function getPassageContext(range: StudyRange): PassageContext {
  if (!validRange(range)) return empty('unavailable')
  if (range.edition.startsWith('imp_')) {
    const chapter = getImportedChapter({ translation: range.edition, book: range.book, chapter: range.chapter })
    const present = chapter.verses.some(v => v.verse >= (range.firstVerse ?? 0) &&
      v.verse <= (range.lastVerse ?? range.firstVerse ?? Number.MAX_SAFE_INTEGER))
    return empty(present ? 'unverified' : 'unavailable')
  }
  const db = bibleDb()
  if (!db) throw new Error('Bible database not available')
  return readPassageContext(db, range)
}

export function getPersonMap(personId: number): PersonMap | null {
  const db = bibleDb()
  if (!db) throw new Error('Bible database not available')
  if (!Number.isSafeInteger(personId)) return null
  const person = db.prepare('SELECT name FROM people WHERE id=?').get(personId)
  return person ? { personId, name: String(person.name), stops: stopsForPerson(personId) } : null
}
