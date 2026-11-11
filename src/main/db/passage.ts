import type { DatabaseSync } from 'node:sqlite'
import { BOOK_BY_ID } from '../../shared/books'
import type { ScripturePassage } from '../../shared/refs'
import type { ChatCitation } from '../../shared/types'

/** Read complete verses in native edition coordinates, including ranges spanning two chapters. */
export function readPassage(db: DatabaseSync, table: 'verses' | 'imported_verses', translation: string, ref: ScripturePassage): ChatCitation[] {
  const rows = db.prepare(`SELECT chapter, verse, text FROM ${table}
    WHERE translation_id=? AND book_id=? AND chapter BETWEEN ? AND ?
      AND (chapter > ? OR verse >= ?) AND (chapter < ? OR verse <= ?)
    ORDER BY chapter, verse LIMIT 256`)
    .all(translation, ref.book, ref.chapter, ref.lastChapter,
      ref.chapter, ref.firstVerse ?? 0, ref.lastChapter, ref.lastVerse ?? Number.MAX_SAFE_INTEGER)
  return rows.map(r => ({ translation, book: ref.book, bookName: BOOK_BY_ID[ref.book].name,
    chapter: Number(r.chapter), verse: Number(r.verse), text: String(r.text) }))
}
