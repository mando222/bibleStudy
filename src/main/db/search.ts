import type { DatabaseSync } from 'node:sqlite'
import { BOOKS, BOOK_BY_ID } from '../../shared/books'
import { foldLatinHomoglyphs } from '../../shared/originalText'
import { greekOrderStatusSql } from './greekOrder'
import type { SearchQuery, SearchResponse } from '../../shared/types'

export function scopedBooks(q: Pick<SearchQuery, 'book' | 'testament'>): string[] | undefined {
  if (!q.book && (!q.testament || q.testament === 'all')) return undefined
  return BOOKS.filter((b) =>
    (!q.book || b.id === q.book) && (!q.testament || q.testament === 'all' || b.testament === q.testament)
  ).map((b) => b.id)
}

export const greekScript = /[\u0370-\u03ff\u1f00-\u1fff]/
export const hebrewScript = /[\u0590-\u05ff]/
export const greekNtEditions = new Set(['NA', 'TR', 'BYZ'])

function foldScript(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g, '')
    .toLowerCase().replace(/ς/g, 'σ')
}

export function searchText(
  db: DatabaseSync, table: 'verses_fts' | 'imported_fts', translations: string[], q: SearchQuery
): SearchResponse {
  const books = scopedBooks(q)
  let term = q.text.trim()
  const quoted = term.length >= 2 && ((term.startsWith('"') && term.endsWith('"')) ||
    (term.startsWith('“') && term.endsWith('”')))
  if (quoted) term = term.slice(1, -1)
  if (table === 'verses_fts' && greekScript.test(term)) term = foldLatinHomoglyphs(term)
  if (hebrewScript.test(term) || greekScript.test(term)) {
    // The bundled index uses the build pipeline's equivalent folded Greek/Hebrew keys.
    term = table === 'verses_fts'
      ? term.normalize('NFD').replace(/[\u0300-\u036f\u0591-\u05c7]/g, '').toLowerCase().replace(/ς/g, 'σ')
      : foldScript(term)
  }
  const words = term.replace(/["*]/g, ' ').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (!words.length || books?.length === 0 || !translations.length) return { total: 0, hits: [] }
  const match = quoted ? `"${words.join(' ')}"` :
    words.map((w, i) => i === words.length - 1 ? `"${w}"*` : `"${w}"`).join(' ')
  const params = [match, ...translations, ...(books ?? [])]
  const cond = [`${table} MATCH ?`, `translation_id IN (${translations.map(() => '?').join(',')})`]
  if (books) cond.push(`book_id IN (${books.map(() => '?').join(',')})`)
  const where = cond.join(' AND ')
  const total = Number(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get(...params)?.n)
  // Imported FTS terms are accent-folded. Show the module's printed wording in the results.
  const marked = `snippet(${table}, 0, '{{', '}}', '…', 12)`
  const snippet = table === 'imported_fts' ? `CASE WHEN printed=text THEN ${marked} ELSE printed END` : marked
  const includeGreek = table === 'verses_fts' && translations.some(id => greekNtEditions.has(id))
  // Greek FTS keys are unaccented. Preserve the edition's spelling separately from its match markers.
  const greekFields = includeGreek ? `, ${greekOrderStatusSql(db, 'verses_fts')} AS orderStatus,
    CASE WHEN translation_id IN ('NA','TR','BYZ') THEN highlight(verses_fts, 0, '{{', '}}') END AS markedGreekKey,
    CASE WHEN translation_id IN ('NA','TR','BYZ') THEN (SELECT group_concat(t.original, ' ' ORDER BY t.position)
      FROM original_tokens t WHERE t.edition=verses_fts.translation_id AND t.book_id=verses_fts.book_id
        AND t.chapter=verses_fts.chapter AND t.verse=verses_fts.verse) END AS printedGreek` : ''
  const rows = db.prepare(`SELECT translation_id, book_id, chapter, verse, ${snippet} AS snippet ${greekFields}
      FROM ${table} WHERE ${where} ORDER BY rank, rowid LIMIT ? OFFSET ?`)
    .all(...params, Math.max(0, Math.min(q.limit ?? 100, 300)), Math.max(0, q.offset ?? 0))
  return { total, hits: rows.map((r) => {
    const book = String(r.book_id)
    const translation = String(r.translation_id)
    return { translation, ...(greekNtEditions.has(translation) ? { edition: translation } : {}),
      ...(r.orderStatus === 'unverified' || r.orderStatus === 'unknown' ? { orderStatus: r.orderStatus } : {}),
      ...(r.printedGreek ? { markedGreekKey: String(r.markedGreekKey) } : {}),
      book, bookName: BOOK_BY_ID[book]?.name ?? book, chapter: Number(r.chapter),
      verse: Number(r.verse), snippet: String(r.printedGreek ?? r.snippet) }
  }) }
}

/** Index legacy and new imports alike. Keep the derived index connection-local, outside backups. */
export function searchImportedText(db: DatabaseSync, q: SearchQuery): SearchResponse {
  if (/^[GH]0*\d{1,5}[a-z]?$/i.test(q.text.trim())) {
    return { total: 0, hits: [], notice: 'This imported translation has no Strong’s word tags.' }
  }
  if (!db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name='imported_fts'").get()) {
    db.function('fold_imported_text', { deterministic: true }, value =>
      typeof value === 'string' && (greekScript.test(value) || hebrewScript.test(value)) ? foldScript(value) : value)
    db.exec(`
      CREATE VIRTUAL TABLE temp.imported_fts USING fts5(
        text, translation_id UNINDEXED, book_id UNINDEXED, chapter UNINDEXED, verse UNINDEXED, printed UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2');
      CREATE TEMP TABLE indexed_import(id TEXT PRIMARY KEY);
      CREATE TEMP TRIGGER imported_fts_insert AFTER INSERT ON main.imported_verses BEGIN
        DELETE FROM indexed_import WHERE id=new.translation_id;
      END;
      CREATE TEMP TRIGGER imported_fts_delete AFTER DELETE ON main.imported_verses BEGIN
        DELETE FROM indexed_import WHERE id=old.translation_id;
      END;
      CREATE TEMP TRIGGER imported_fts_update AFTER UPDATE ON main.imported_verses BEGIN
        DELETE FROM indexed_import WHERE id IN (old.translation_id, new.translation_id);
      END;
    `)
  }
  // Only materialize the selected module. A rollback also rolls back trigger invalidations.
  if (!db.prepare('SELECT 1 FROM indexed_import WHERE id=?').get(q.translation)) {
    db.exec('SAVEPOINT index_import')
    try {
      db.exec('DELETE FROM indexed_import; DELETE FROM imported_fts')
      db.prepare(`INSERT INTO imported_fts(text, translation_id, book_id, chapter, verse, printed)
        SELECT fold_imported_text(text), translation_id, book_id, chapter, verse, text
        FROM main.imported_verses WHERE translation_id=?`).run(q.translation)
      db.prepare('INSERT INTO indexed_import VALUES (?)').run(q.translation)
      db.exec('RELEASE index_import')
    } catch (error) {
      db.exec('ROLLBACK TO index_import; RELEASE index_import')
      throw error
    }
  }
  return searchText(db, 'imported_fts', [q.translation], q)
}
