import { bibleDb } from './bible'
import type {
  PersonListItem,
  PersonDetail,
  PersonRef,
  PlaceItem,
  EventItem
} from '../../shared/types'

// People / places / events (Theographic) power the Genealogies, Maps, and Timelines views.
// Every entity carries its verse references as a JSON array of "Book.ch.v" keys.

function db(): NonNullable<ReturnType<typeof bibleDb>> {
  const d = bibleDb()
  if (!d) throw new Error('Bible database not available')
  return d
}

/** People for the Genealogies list, optionally filtered by a name query. */
export function getPeople(query = '', limit = 400): PersonListItem[] {
  const d = db()
  const q = query.trim()
  const where = q ? 'WHERE name LIKE ?' : ''
  const params: (string | number)[] = q ? [`%${q}%`] : []
  const rows = d
    .prepare(
      `SELECT id, name, gender, birth_year, death_year, verse_count
       FROM people ${where} ORDER BY verse_count DESC, name LIMIT ?`
    )
    .all(...params, Math.min(limit, 800)) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    gender: (r.gender as string) ?? null,
    birthYear: (r.birth_year as number) ?? null,
    deathYear: (r.death_year as number) ?? null,
    verseCount: r.verse_count as number
  }))
}

/** One person: relationships (clickable) + every verse that references them. */
export function getPerson(id: number): PersonDetail | null {
  const d = db()
  const p = d.prepare('SELECT * FROM people WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!p) return null
  const refOf = (pid: unknown): PersonRef | null => {
    if (pid == null) return null
    const r = d.prepare('SELECT id, name FROM people WHERE id = ?').get(pid as number)
    return (r as unknown as PersonRef) ?? null
  }
  const children = d
    .prepare(
      `SELECT pl.id, pl.name FROM person_links l JOIN people pl ON pl.id = l.related_id
       WHERE l.person_id = ? AND l.kind = 'child' ORDER BY pl.name`
    )
    .all(id) as unknown as PersonRef[]
  const spouses = d
    .prepare(
      `SELECT DISTINCT pl.id, pl.name FROM person_links l
       JOIN people pl ON pl.id = CASE WHEN l.person_id = ? THEN l.related_id ELSE l.person_id END
       WHERE l.kind = 'spouse' AND (l.person_id = ? OR l.related_id = ?) ORDER BY pl.name`
    )
    .all(id, id, id) as unknown as PersonRef[]
  return {
    id: p.id as number,
    name: p.name as string,
    gender: (p.gender as string) ?? null,
    birthYear: (p.birth_year as number) ?? null,
    deathYear: (p.death_year as number) ?? null,
    verseCount: p.verse_count as number,
    summary: (p.summary as string) ?? null,
    father: refOf(p.father_id),
    mother: refOf(p.mother_id),
    spouses,
    children,
    verses: JSON.parse((p.verses as string) || '[]') as string[]
  }
}

/** The paternal lineage trace: the chain of fathers from the root ancestor down to this person. */
export function getAncestry(id: number): PersonRef[] {
  const d = db()
  const stmt = d.prepare('SELECT id, name, father_id FROM people WHERE id = ?')
  const chain: PersonRef[] = []
  const seen = new Set<number>()
  let cur: number | null = id
  while (cur != null && !seen.has(cur) && chain.length < 80) {
    seen.add(cur)
    const p = stmt.get(cur) as { id: number; name: string; father_id: number | null } | undefined
    if (!p) break
    chain.push({ id: p.id, name: p.name })
    cur = p.father_id ?? null
  }
  return chain.reverse() // earliest ancestor first
}

/** Geolocated places for the map. (SELECT * so derived start_year/end_year are read when present.) */
export function getPlaces(): PlaceItem[] {
  const rows = db()
    .prepare(
      `SELECT * FROM places WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY verse_count DESC`
    )
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    lat: r.lat as number,
    lon: r.lon as number,
    featureType: (r.feature_type as string) ?? null,
    verseCount: r.verse_count as number,
    startYear: (r.start_year as number) ?? null,
    endYear: (r.end_year as number) ?? null
  }))
}

export function getPlaceVerses(id: number): string[] {
  const r = db().prepare('SELECT verses FROM places WHERE id = ?').get(id) as
    | { verses: string }
    | undefined
  return r ? (JSON.parse(r.verses) as string[]) : []
}

/** Events for the timeline, in chronological order, with participants, places, and verses. */
export function getEvents(): EventItem[] {
  const d = db()
  const rows = d
    .prepare('SELECT * FROM events ORDER BY sort_key, start_year')
    .all() as Record<string, unknown>[]
  const nameOf = d.prepare('SELECT id, name FROM people WHERE id = ?')
  const placeOf = d.prepare('SELECT id, name FROM places WHERE id = ?')
  const refs = (json: unknown, stmt: typeof nameOf): PersonRef[] =>
    (JSON.parse((json as string) || '[]') as number[])
      .map((pid) => stmt.get(pid) as unknown as PersonRef | undefined)
      .filter((x): x is PersonRef => !!x)
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    startYear: (r.start_year as number) ?? null,
    endYear: (r.end_year as number) ?? null,
    participants: refs(r.participants, nameOf),
    places: refs(r.place_ids, placeOf),
    verses: JSON.parse((r.verses as string) || '[]') as string[]
  }))
}
