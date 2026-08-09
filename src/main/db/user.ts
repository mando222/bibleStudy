import { DatabaseSync } from 'node:sqlite'
import { join, basename } from 'node:path'
import { app } from 'electron'
import { BOOKS, BOOK_BY_ID } from '../../shared/books'
import type {
  ChapterRef,
  ChapterContent,
  Highlight,
  HighlightInput,
  HighlightColor,
  ImportedTranslation,
  Note,
  NoteInput,
  Translation
} from '../../shared/types'

let db: DatabaseSync | null = null

// Bump when the user schema changes, and add exactly one migration step per bump below.
const USER_SCHEMA_VERSION = 1

/**
 * Evolve an existing user.sqlite in place across app updates, so notes/highlights/imports are
 * never lost or broken. The CREATE TABLE block above is the frozen v1 schema; every LATER change
 * must be an ALTER-style step here (never by editing that block), keyed by version so it runs once.
 */
function migrate(d: DatabaseSync): void {
  d.exec('CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT)')
  const row = d.prepare("SELECT value FROM user_meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined
  let v = row ? Number(row.value) : 0
  // steps[n] upgrades a v=n database to v=n+1 (non-destructively). v1 is the baseline (no-op).
  const steps: (() => void)[] = [
    () => {} // 0 -> 1: baseline tables already created above
    // 1 -> 2 example: () => d.exec('ALTER TABLE notes ADD COLUMN tags TEXT')
  ]
  while (v < USER_SCHEMA_VERSION) {
    steps[v]?.()
    v++
  }
  d.prepare("INSERT OR REPLACE INTO user_meta (key, value) VALUES ('schema_version', ?)").run(
    String(USER_SCHEMA_VERSION)
  )
}

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

    CREATE TABLE IF NOT EXISTS imported_translations (
      id        TEXT PRIMARY KEY,
      abbrev    TEXT NOT NULL,
      name      TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'ltr',
      added_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS imported_verses (
      translation_id TEXT NOT NULL,
      book_id        TEXT NOT NULL,
      chapter        INTEGER NOT NULL,
      verse          INTEGER NOT NULL,
      text           TEXT NOT NULL,
      PRIMARY KEY (translation_id, book_id, chapter, verse)
    );
  `)
  migrate(db)
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

// ---- Imported translations (user-owned NKJV/NASB etc. from MySword/e-Sword) ----

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
}
function stripHtml(s: string): string {
  return (s || '')
    // MySword/e-Sword tags whose CONTENT is metadata, not verse text
    // (<S>strong</S>, <m>morph</m>, <n>note</n>, <f>footnote</f>).
    .replace(/<(S|m|n|f)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '') // remaining tags (italics, formatting) — keep their text
    .replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueImportedId(abbrev: string): string {
  const base = `imp_${abbrev.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'mod'}`
  const d = required()
  let id = base
  let n = 2
  while (d.prepare('SELECT 1 FROM imported_translations WHERE id = ?').get(id)) id = `${base}${n++}`
  return id
}

/** Import a translation from a MySword/e-Sword SQLite module. Throws on unrecognized files. */
export function importFromSqlite(filePath: string): ImportedTranslation {
  const src = new DatabaseSync(filePath, { readOnly: true })
  try {
    const tables = (
      src.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name)

    let table = ''
    let textCol = ''
    for (const t of tables) {
      const cols = (src.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) =>
        c.name.toLowerCase()
      )
      if (cols.includes('book') && cols.includes('chapter') && cols.includes('verse')) {
        textCol = cols.includes('scripture') ? 'Scripture' : cols.includes('text') ? 'text' : ''
        if (textCol) {
          table = t
          break
        }
      }
    }
    if (!table) {
      throw new Error('Unrecognized module: expected a Bible table with Book/Chapter/Verse/Scripture.')
    }

    let title = ''
    let abbrev = ''
    let rtl = false
    try {
      const d = src.prepare('SELECT * FROM Details LIMIT 1').get() as Record<string, unknown> | undefined
      if (d) {
        title = (d.Title as string) || (d.Description as string) || ''
        abbrev = (d.Abbreviation as string) || ''
        rtl = !!d.RightToLeft
      }
    } catch {
      /* no Details table */
    }
    const fallback = basename(filePath).replace(/\.[^.]+$/, '')
    title = title || fallback
    abbrev = (abbrev || fallback).slice(0, 8)

    const rows = src
      .prepare(`SELECT Book AS b, Chapter AS c, Verse AS v, ${textCol} AS s FROM "${table}"`)
      .all() as { b: number; c: number; v: number; s: string }[]

    const d = required()
    const id = uniqueImportedId(abbrev)
    d.prepare(
      'INSERT OR REPLACE INTO imported_translations (id, abbrev, name, direction, added_at) VALUES (?,?,?,?,?)'
    ).run(id, abbrev, title, rtl ? 'rtl' : 'ltr', Date.now())

    const ins = d.prepare(
      'INSERT OR REPLACE INTO imported_verses (translation_id, book_id, chapter, verse, text) VALUES (?,?,?,?,?)'
    )
    let count = 0
    d.exec('BEGIN')
    for (const r of rows) {
      if (r.b < 1 || r.b > 66) continue
      const book = BOOKS[r.b - 1]?.id
      if (!book) continue
      const text = stripHtml(r.s)
      if (!text) continue
      ins.run(id, book, r.c, r.v, text)
      count++
    }
    d.exec('COMMIT')

    return { id, abbrev, name: title, direction: rtl ? 'rtl' : 'ltr', verseCount: count }
  } finally {
    src.close()
  }
}

export function listImported(): Translation[] {
  const rows = required()
    .prepare('SELECT id, abbrev, name, direction FROM imported_translations ORDER BY added_at')
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    abbrev: r.abbrev as string,
    name: r.name as string,
    language: 'imported',
    direction: (r.direction as 'ltr' | 'rtl') ?? 'ltr',
    isOriginal: false,
    hasStrongs: false,
    license: 'User-imported',
    attribution: 'Imported from a module you supplied.'
  }))
}

export function isImported(id: string): boolean {
  return !!required().prepare('SELECT 1 FROM imported_translations WHERE id = ?').get(id)
}

export function getImportedChapter(ref: ChapterRef): ChapterContent {
  const d = required()
  const meta = d
    .prepare('SELECT name, direction FROM imported_translations WHERE id = ?')
    .get(ref.translation) as { name: string; direction: string } | undefined
  const rows = d
    .prepare(
      'SELECT verse, text FROM imported_verses WHERE translation_id = ? AND book_id = ? AND chapter = ? ORDER BY verse'
    )
    .all(ref.translation, ref.book, ref.chapter) as { verse: number; text: string }[]
  return {
    translation: ref.translation,
    book: ref.book,
    chapter: ref.chapter,
    bookName: BOOK_BY_ID[ref.book]?.name ?? ref.book,
    direction: (meta?.direction as 'ltr' | 'rtl') ?? 'ltr',
    verses: rows.map((r) => ({ verse: r.verse, text: r.text, tokens: null }))
  }
}

export function deleteImported(id: string): void {
  const d = required()
  d.prepare('DELETE FROM imported_verses WHERE translation_id = ?').run(id)
  d.prepare('DELETE FROM imported_translations WHERE id = ?').run(id)
}
