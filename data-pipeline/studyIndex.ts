import type { DatabaseSync } from 'node:sqlite'
import { reviewedAssociations, reviewedSettings } from '../src/shared/reviewedPlaces'

/** Invert source-entity citations for fast passage lookup. Keep links to unlocated places. */
export function buildStudyIndex(db: DatabaseSync): void {
  db.exec('BEGIN')
  try {
    for (const [kind, table] of [['person', 'people'], ['place', 'places'], ['event', 'events']]) {
      db.exec(`INSERT INTO study_references (ref,kind,entity_id)
        SELECT DISTINCT verse.value, '${kind}', entity.id FROM ${table} entity, json_each(entity.verses) verse`)
    }
    const target = db.prepare('SELECT 1 FROM study_references WHERE ref=? AND kind=? AND entity_id=?')
    const verse = db.prepare("SELECT 1 FROM verses WHERE translation_id='KJV' AND book_id=? AND chapter=? AND verse=?")
    const person = db.prepare('SELECT 1 FROM people WHERE id=?')
    const place = db.prepare('SELECT 1 FROM places WHERE id=?')
    for (const a of reviewedAssociations) {
      if (!place.get(a.placeId) || a.people.some(id => !person.get(id))) {
        throw new Error('Unknown person or place in reviewed association: ' + a.label)
      }
      for (const key of a.refs) {
        const [book, ch, v] = key.split('.')
        if (!verse.get(book, Number(ch), Number(v))) throw new Error('Missing citation: ' + key)
      }
    }
    for (const [ref, ids] of Object.entries(reviewedSettings)) {
      for (const id of ids) if (!target.get(ref, 'place', id)) throw new Error('Missing setting link: ' + ref)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
