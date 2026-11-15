import { bibleDb } from './bible'
import { motherRefs } from '../../shared/familyEvidence'
import { atlasIdentity, personAliasIds } from './personMapNames'
import type { MapName } from './personMapNames'
import { mappedPlaceIds } from './passageStudy'
import type {
  PersonListItem,
  PeoplePage,
  PersonDetail,
  PersonRef,
  FamilyChild,
  FamilySibling,
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
  return getPeoplePage(query, limit, 0).people
}

export function getPeoplePage(query: string, limit: number, offset: number): PeoplePage {
  const d = db()
  const key = query.trim()
  const where = key ? 'WHERE instr(lower(p.name), lower(?)) > 0 OR p.id IN (SELECT value FROM json_each(?))' : ''
  const args = key ? [key, JSON.stringify(personAliasIds(key))] : []
  const { total } = d.prepare(`SELECT count(*) AS total FROM people p ${where}`).get(...args) as { total: number }
  const rows = d.prepare(`WITH namesakes AS (SELECT name FROM people GROUP BY name HAVING count(*) > 1)
    SELECT p.id, p.name, p.gender, p.birth_year AS birthYear, p.death_year AS deathYear,
      p.verse_count AS verseCount, json_extract(p.verses, '$[0]') AS firstRef, parent.name AS parentName,
      namesakes.name IS NOT NULL AS hasNamesake
    FROM people p LEFT JOIN people parent ON parent.id = COALESCE(p.father_id, p.mother_id)
    LEFT JOIN namesakes ON namesakes.name = p.name ${where}
    ORDER BY p.verse_count DESC, p.name, p.id LIMIT ? OFFSET ?`)
    .all(...args, Math.min(800, Math.max(1, Math.trunc(limit))), Math.max(0, Math.trunc(offset))) as unknown as
      (MapName & PersonListItem & { firstRef: string | null })[]
  return { total, people: rows.map(row => ({
    ...atlasIdentity(row), gender: row.gender, birthYear: row.birthYear, deathYear: row.deathYear,
    verseCount: row.verseCount, firstRef: row.firstRef
  })) }
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
  const childRows = d.prepare(`SELECT c.id, c.name, f.id AS fatherId, f.name AS fatherName,
      m.id AS motherId, m.name AS motherName FROM people c
    LEFT JOIN people f ON f.id=c.father_id LEFT JOIN people m ON m.id=c.mother_id
    WHERE c.father_id=? OR c.mother_id=? OR c.id IN
      (SELECT related_id FROM person_links WHERE person_id=? AND kind='child')
    ORDER BY c.name, c.id`).all(id, id, id) as unknown as
      (PersonRef & { fatherId: number | null; fatherName: string; motherId: number | null; motherName: string })[]
  const children: FamilyChild[] = childRows.map(c => ({
    id: c.id, name: c.name,
    father: c.fatherId == null ? null : { id: c.fatherId, name: c.fatherName },
    mother: c.motherId == null ? null : { id: c.motherId, name: c.motherName },
    motherRefs: motherRefs(c.motherId, c.id)
  }))
  // An explicit sibling link can exist without a named parent. A half-sibling
  // label requires a shared parent AND two different identified other parents.
  const siblings = d.prepare(`SELECT s.id, s.name, CASE
      WHEN s.father_id=p.father_id AND s.mother_id=p.mother_id THEN 'both'
      WHEN s.father_id=p.father_id AND s.mother_id<>p.mother_id THEN 'halfFather'
      WHEN s.mother_id=p.mother_id AND s.father_id<>p.father_id THEN 'halfMother'
      WHEN s.father_id=p.father_id THEN 'father'
      WHEN s.mother_id=p.mother_id THEN 'mother'
      ELSE 'recorded' END AS relation
    FROM people p JOIN people s ON s.id<>p.id AND
      (s.father_id=p.father_id OR s.mother_id=p.mother_id OR s.id IN
        (SELECT CASE WHEN person_id=? THEN related_id ELSE person_id END FROM person_links
         WHERE kind='sibling' AND (person_id=? OR related_id=?)))
    WHERE p.id=? ORDER BY s.name, s.id`).all(id, id, id, id) as unknown as FamilySibling[]
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
    mappedPlaceCount: mappedPlaceIds(d, id).size,
    summary: (p.summary as string) ?? null,
    father: refOf(p.father_id),
    mother: refOf(p.mother_id),
    spouses,
    children,
    siblings,
    verses: JSON.parse((p.verses as string) || '[]') as string[]
  }
}

/** The paternal lineage trace: the chain of fathers from the root ancestor down to this person. */
export function getAncestry(id: number): PersonRef[] {
  // Include the reader's selection, with the oldest known ancestor first. The comma-delimited
  // ID path stops cycles without confusing a short ID with a substring of another.
  return db().prepare(`WITH RECURSIVE ancestry(id, name, father_id, depth, path) AS (
    SELECT id, name, father_id, 1, printf(',%d,', id) FROM people WHERE id=?
    UNION ALL
    SELECT p.id, p.name, p.father_id, a.depth + 1, a.path || p.id || ','
      FROM ancestry a JOIN people p ON p.id=a.father_id
      WHERE a.depth < 80 AND instr(a.path, printf(',%d,', p.id))=0
    ) SELECT id, name FROM ancestry ORDER BY depth DESC`).all(id) as unknown as PersonRef[]
}

/** The full atlas directory includes unlocated places and their references. */
export function getPlaces(): PlaceItem[] {
  const rows = db()
    .prepare(
      `SELECT *, json_extract(verses, '$[0]') AS first_ref FROM places ORDER BY verse_count DESC, name, id`
    )
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    lat: (r.lat as number) ?? null,
    lon: (r.lon as number) ?? null,
    aliases: JSON.parse((r.aliases as string) || '[]'),
    precision: (r.precision as string) ?? null,
    ambiguous: Boolean(r.ambiguous),
    identificationNote: (r.identification_note as string) ?? null,
    comment: (r.comment as string) ?? null,
    firstRef: (r.first_ref as string) ?? null,
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
  // A single catalog query per entity kind keeps the 450-event timeline responsive over
  // a database bridge. The publisher's participant and place arrays retain their order.
  const catalog = (table: 'people' | 'places', column: 'participants' | 'place_ids') => {
    const entries = d.prepare(`SELECT id, name FROM ${table} WHERE id IN (
      SELECT j.value FROM events e, json_each(e.${column}) j)`).all() as unknown as PersonRef[]
    return new Map(entries.map(item => [item.id, item]))
  }
  const people = catalog('people', 'participants')
  const places = catalog('places', 'place_ids')
  const refs = (json: unknown, names: Map<number, PersonRef>): PersonRef[] =>
    (JSON.parse(String(json || '[]')) as number[]).flatMap(id => names.get(id) ?? [])
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    startYear: (r.start_year as number) ?? null,
    endYear: (r.end_year as number) ?? null,
    participants: refs(r.participants, people),
    places: refs(r.place_ids, places),
    verses: JSON.parse((r.verses as string) || '[]') as string[]
  }))
}
