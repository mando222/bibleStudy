import type { DatabaseSync } from 'node:sqlite'

/** The review uses reader coordinates, even when the edition prints a different verse number. */
export function greekOrderStatusSql(db: DatabaseSync, source: 'verses_fts' | 'original_tokens' | 'r'): string {
  const edition = source + (source === 'verses_fts' ? '.translation_id' : '.edition')
  const reviewed = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='greek_order_uncertainties'").get()
  const status = reviewed ? `(SELECT 'unverified' FROM greek_order_uncertainties u
    WHERE u.edition=${edition} AND u.book_id=${source}.book_id
      AND u.chapter=${source}.chapter AND u.verse=${source}.verse)` : "'unknown'"
  return `CASE WHEN ${edition} IN ('NA','TR','BYZ') THEN ${status} END`
}
