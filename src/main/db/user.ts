import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  ChapterRef,
  Highlight,
  HighlightInput,
  HighlightColor,
  Note,
  NoteInput
} from '../../shared/types'

let db: DatabaseSync | null = null

/** Open (creating if needed) the writable user database in userData.
 *  Kept separate from bible.sqlite so app updates never touch user content. */
export function openUserDb(): void {
  if (db) return
  const path = join(app.getPath('userData'), 'user.sqlite')
  db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS highlights (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      translation TEXT NOT NULL,
      book        TEXT NOT NULL,
      chapter     INTEGER NOT NULL,
      verse       INTEGER NOT NULL,
      start_token INTEGER,
      end_token   INTEGER,
      color       TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hl_loc ON highlights (translation, book, chapter);

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      book       TEXT NOT NULL,
      chapter    INTEGER NOT NULL,
      verse      INTEGER NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_loc ON notes (book, chapter);
  `)
}

function required(): DatabaseSync {
  if (!db) openUserDb()
  return db as DatabaseSync
}

function mapHighlight(r: Record<string, unknown>): Highlight {
  return {
    id: r.id as number,
    translation: r.translation as string,
    book: r.book as string,
    chapter: r.chapter as number,
    verse: r.verse as number,
    startToken: (r.start_token as number) ?? null,
    endToken: (r.end_token as number) ?? null,
    color: r.color as HighlightColor,
    createdAt: r.created_at as number
  }
}

function mapNote(r: Record<string, unknown>): Note {
  return {
    id: r.id as number,
    book: r.book as string,
    chapter: r.chapter as number,
    verse: r.verse as number,
    body: r.body as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

export function listHighlights(ref: ChapterRef): Highlight[] {
  const rows = required()
    .prepare('SELECT * FROM highlights WHERE translation = ? AND book = ? AND chapter = ?')
    .all(ref.translation, ref.book, ref.chapter) as Record<string, unknown>[]
  return rows.map(mapHighlight)
}

export function saveHighlight(input: HighlightInput): Highlight {
  const d = required()
  // One verse-level highlight per verse+translation: replace any existing.
  if (input.startToken == null) {
    d.prepare(
      'DELETE FROM highlights WHERE translation = ? AND book = ? AND chapter = ? AND verse = ? AND start_token IS NULL'
    ).run(input.translation, input.book, input.chapter, input.verse)
  }
  const now = Date.now()
  const info = d
    .prepare(
      `INSERT INTO highlights (translation, book, chapter, verse, start_token, end_token, color, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      input.translation,
      input.book,
      input.chapter,
      input.verse,
      input.startToken,
      input.endToken,
      input.color,
      now
    )
  return { id: Number(info.lastInsertRowid), ...input, createdAt: now }
}

export function deleteHighlight(id: number): void {
  required().prepare('DELETE FROM highlights WHERE id = ?').run(id)
}

export function listNotes(ref: { book: string; chapter: number }): Note[] {
  const rows = required()
    .prepare('SELECT * FROM notes WHERE book = ? AND chapter = ? ORDER BY verse, id')
    .all(ref.book, ref.chapter) as Record<string, unknown>[]
  return rows.map(mapNote)
}

export function saveNote(input: NoteInput): Note {
  const d = required()
  const now = Date.now()
  if (input.id) {
    d.prepare('UPDATE notes SET body = ?, verse = ?, updated_at = ? WHERE id = ?').run(
      input.body,
      input.verse,
      now,
      input.id
    )
    return mapNote(d.prepare('SELECT * FROM notes WHERE id = ?').get(input.id) as Record<string, unknown>)
  }
  const info = d
    .prepare('INSERT INTO notes (book, chapter, verse, body, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(input.book, input.chapter, input.verse, input.body, now, now)
  return {
    id: Number(info.lastInsertRowid),
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    body: input.body,
    createdAt: now,
    updatedAt: now
  }
}

export function deleteNote(id: number): void {
  required().prepare('DELETE FROM notes WHERE id = ?').run(id)
}
