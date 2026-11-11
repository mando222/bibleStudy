import type { DatabaseSync } from 'node:sqlite'
import { normGreek, normHebrew } from './lib'

export function buildWordDirectory(db: DatabaseSync): void {
  // Preserve the historical headword where it exists. For other IDs use the first
  // publisher entry in file order; the detail pane exposes every sense and its source.
  const rows = db.prepare(`
    SELECT id,language,lemma,translit,kjv_def AS gloss,definition,'Strong' AS source FROM strongs_lexicon
    UNION ALL
    SELECT l.strongs, CASE WHEN l.strongs LIKE 'H%' THEN 'hebrew' ELSE 'greek' END,
      l.headword,l.translit,l.gloss,NULL,l.lexicon
    FROM lexicon_entries l WHERE NOT EXISTS (SELECT 1 FROM strongs_lexicon s WHERE s.id=l.strongs)
    AND l.id=(SELECT i.id FROM lexicon_entries i WHERE i.strongs=l.strongs ORDER BY i.lexicon,i.sort,i.id LIMIT 1)
  `).all()
  const insert = db.prepare('INSERT INTO lexicon_headwords VALUES(?,?,?,?,?,?,?,?)')
  db.exec('BEGIN')
  for (const r of rows) {
    const lemma = String(r.lemma || '')
    insert.run(r.id, r.language, lemma, r.translit, r.gloss, r.definition,
      r.language === 'hebrew' ? normHebrew(lemma) : normGreek(lemma), r.source)
  }
  db.exec('COMMIT')
}
