import { DatabaseSync } from 'node:sqlite'
import { join, basename } from 'node:path'
import { app } from 'electron'
import { BOOKS, BOOK_BY_ID } from '../../shared/books'
import { schedule, newCard } from './srs'
import type {
  ChapterRef,
  ChapterContent,
  Highlight,
  HighlightInput,
  HighlightColor,
  ImportedTranslation,
  Note,
  NoteInput,
  Translation,
  Bookmark,
  HistoryEntry,
  SrsCard,
  SrsStats
} from '../../shared/types'

let db: DatabaseSync | null = null

// Bump when the user schema changes, and add exactly one migration step per bump below.
const USER_SCHEMA_VERSION = 2

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
    () => {}, // 0 -> 1: baseline tables already created above
    // 1 -> 2: spaced-repetition cards, learn progress, bookmarks, reading history.
    () =>
      d.exec(`
        CREATE TABLE IF NOT EXISTS srs_cards (
          strongs       TEXT PRIMARY KEY,
          language      TEXT NOT NULL,
          ease          REAL NOT NULL DEFAULT 2.5,
          interval_days INTEGER NOT NULL DEFAULT 0,
          due_at        INTEGER NOT NULL DEFAULT 0,
          reps          INTEGER NOT NULL DEFAULT 0,
          lapses        INTEGER NOT NULL DEFAULT 0,
          last_grade    INTEGER,
          updated_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_cards (language, due_at);

        CREATE TABLE IF NOT EXISTS learn_progress (
          module     TEXT NOT NULL,
          key        TEXT NOT NULL,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (module, key)
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          book       TEXT NOT NULL,
          chapter    INTEGER NOT NULL,
          verse      INTEGER NOT NULL DEFAULT 1,
          note       TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reading_history (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          book       TEXT NOT NULL,
          chapter    INTEGER NOT NULL,
          verse      INTEGER,
          visited_at INTEGER NOT NULL
        );
      `)
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

/** Every note, ordered canonically — for the Markdown export. */
export function listAllNotes(): Note[] {
  return (
    required().prepare('SELECT * FROM notes ORDER BY book, chapter, verse, id').all() as Record<
      string,
      unknown
    >[]
  ).map(mapNote)
}

/** Every highlight, ordered canonically — for the Markdown export. */
export function listAllHighlights(): Highlight[] {
  return (
    required()
      .prepare('SELECT * FROM highlights ORDER BY book, chapter, verse, id')
      .all() as Record<string, unknown>[]
  ).map(mapHighlight)
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

// ---- Bookmarks & reading history (v2) ----

function mapBookmark(r: Record<string, unknown>): Bookmark {
  return {
    id: r.id as number,
    name: r.name as string,
    book: r.book as string,
    chapter: r.chapter as number,
    verse: r.verse as number,
    note: (r.note as string) ?? null,
    createdAt: r.created_at as number
  }
}

export function listBookmarks(): Bookmark[] {
  return (
    required()
      .prepare('SELECT * FROM bookmarks ORDER BY created_at DESC')
      .all() as Record<string, unknown>[]
  ).map(mapBookmark)
}

export function addBookmark(input: {
  name: string
  book: string
  chapter: number
  verse?: number
  note?: string
}): Bookmark {
  const now = Date.now()
  const info = required()
    .prepare('INSERT INTO bookmarks (name, book, chapter, verse, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(input.name, input.book, input.chapter, input.verse ?? 1, input.note ?? null, now)
  return {
    id: Number(info.lastInsertRowid),
    name: input.name,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse ?? 1,
    note: input.note ?? null,
    createdAt: now
  }
}

export function deleteBookmark(id: number): void {
  required().prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}

/** Record a visited chapter, skipping a duplicate of the most recent entry; keep the last 200. */
export function addHistory(book: string, chapter: number, verse?: number): void {
  const d = required()
  const last = d
    .prepare('SELECT book, chapter FROM reading_history ORDER BY id DESC LIMIT 1')
    .get() as { book: string; chapter: number } | undefined
  if (last && last.book === book && last.chapter === chapter) return
  d.prepare('INSERT INTO reading_history (book, chapter, verse, visited_at) VALUES (?,?,?,?)').run(
    book,
    chapter,
    verse ?? null,
    Date.now()
  )
  d.exec(
    'DELETE FROM reading_history WHERE id NOT IN (SELECT id FROM reading_history ORDER BY id DESC LIMIT 200)'
  )
}

export function listHistory(limit = 50): HistoryEntry[] {
  return (
    required()
      .prepare('SELECT * FROM reading_history ORDER BY id DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as number,
    book: r.book as string,
    chapter: r.chapter as number,
    verse: (r.verse as number) ?? null,
    visitedAt: r.visited_at as number
  }))
}

// ---- Learn: spaced repetition + progress (v2) ----

function mapCard(r: Record<string, unknown>): SrsCard {
  return {
    strongs: r.strongs as string,
    language: r.language as string,
    ease: r.ease as number,
    intervalDays: r.interval_days as number,
    dueAt: r.due_at as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    lastGrade: (r.last_grade as number) ?? null,
    updatedAt: r.updated_at as number
  }
}

export function getCard(strongs: string): SrsCard | null {
  const r = required().prepare('SELECT * FROM srs_cards WHERE strongs = ?').get(strongs) as
    | Record<string, unknown>
    | undefined
  return r ? mapCard(r) : null
}

/** Apply an SM-2 review to a card (creating it if new) and persist the result. */
export function reviewCard(strongs: string, language: string, grade: number): SrsCard {
  const next = schedule(getCard(strongs) ?? newCard(strongs, language), grade, Date.now())
  required()
    .prepare(
      `INSERT INTO srs_cards (strongs, language, ease, interval_days, due_at, reps, lapses, last_grade, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(strongs) DO UPDATE SET
         language=excluded.language, ease=excluded.ease, interval_days=excluded.interval_days,
         due_at=excluded.due_at, reps=excluded.reps, lapses=excluded.lapses,
         last_grade=excluded.last_grade, updated_at=excluded.updated_at`
    )
    .run(
      next.strongs,
      next.language,
      next.ease,
      next.intervalDays,
      next.dueAt,
      next.reps,
      next.lapses,
      next.lastGrade,
      next.updatedAt
    )
  return next
}

export function listDueCards(language: string, limit = 100): SrsCard[] {
  return (
    required()
      .prepare('SELECT * FROM srs_cards WHERE language = ? AND due_at <= ? ORDER BY due_at LIMIT ?')
      .all(language, Date.now(), limit) as Record<string, unknown>[]
  ).map(mapCard)
}

export function srsStats(language: string): SrsStats {
  const d = required()
  const total = (
    d.prepare('SELECT COUNT(*) AS n FROM srs_cards WHERE language = ?').get(language) as { n: number }
  ).n
  const due = (
    d
      .prepare('SELECT COUNT(*) AS n FROM srs_cards WHERE language = ? AND due_at <= ?')
      .get(language, Date.now()) as { n: number }
  ).n
  const learned = (
    d.prepare('SELECT COUNT(*) AS n FROM srs_cards WHERE language = ? AND reps > 0').get(language) as {
      n: number
    }
  ).n
  return { total, due, learned }
}

export function getLearnProgress(module: string): Record<string, string> {
  const rows = required()
    .prepare('SELECT key, value FROM learn_progress WHERE module = ?')
    .all(module) as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

export function setLearnProgress(module: string, key: string, value: string): void {
  required()
    .prepare(
      `INSERT INTO learn_progress (module, key, value, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(module, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    )
    .run(module, key, value, Date.now())
}
