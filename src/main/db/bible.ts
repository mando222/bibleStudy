import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  Translation,
  ChapterRef,
  ChapterContent,
  Verse,
  VerseToken,
  StrongsEntry,
  SearchQuery,
  SearchResponse,
  SearchHit,
  ConcordanceOptions,
  ConcordanceResponse,
  ConcordanceHit
} from '../../shared/types'

let db: DatabaseSync | null = null

function resolveDbPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', 'bible.sqlite'),
    join(app.getAppPath(), 'resources', 'bible.sqlite'),
    join(app.getAppPath(), '..', 'resources', 'bible.sqlite')
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

/** Open the bundled DB read-only. Returns false if it hasn't been built yet. */
export function openBibleDb(): boolean {
  if (db) return true
  const path = resolveDbPath()
  if (!path) return false
  db = new DatabaseSync(path, { readOnly: true })
  db.exec('PRAGMA foreign_keys = OFF;')
  return true
}

export function isReady(): boolean {
  return db !== null || openBibleDb()
}

function required(): DatabaseSync {
  if (!db && !openBibleDb()) {
    throw new Error('Bible database not found. Run `npm run db:build`.')
  }
  return db as DatabaseSync
}

export function listTranslations(): Translation[] {
  if (!isReady()) return []
  const rows = required()
    .prepare(
      `SELECT id, abbrev, name, language, direction, is_original, has_strongs, license, attribution
       FROM translations ORDER BY sort_order, name`
    )
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    abbrev: r.abbrev as string,
    name: r.name as string,
    language: r.language as string,
    direction: (r.direction as 'ltr' | 'rtl') ?? 'ltr',
    isOriginal: !!r.is_original,
    hasStrongs: !!r.has_strongs,
    license: r.license as string,
    attribution: r.attribution as string
  }))
}

export function getChapter(ref: ChapterRef): ChapterContent {
  const d = required()
  const bookRow = d
    .prepare('SELECT name FROM books WHERE id = ?')
    .get(ref.book) as { name: string } | undefined
  const transRow = d
    .prepare('SELECT direction FROM translations WHERE id = ?')
    .get(ref.translation) as { direction: string } | undefined

  const verseRows = d
    .prepare(
      'SELECT verse, text FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ? ORDER BY verse'
    )
    .all(ref.translation, ref.book, ref.chapter) as { verse: number; text: string }[]

  const tokenRows = d
    .prepare(
      `SELECT verse, position, surface, trailer, strongs, lemma, translit, morph, gloss
       FROM verse_tokens WHERE translation_id = ? AND book_id = ? AND chapter = ? ORDER BY verse, position`
    )
    .all(ref.translation, ref.book, ref.chapter) as Record<string, unknown>[]

  const tokensByVerse = new Map<number, VerseToken[]>()
  for (const t of tokenRows) {
    const v = t.verse as number
    if (!tokensByVerse.has(v)) tokensByVerse.set(v, [])
    tokensByVerse.get(v)!.push({
      position: t.position as number,
      surface: t.surface as string,
      trailer: (t.trailer as string) ?? ' ',
      strongs: (t.strongs as string) ?? null,
      lemma: (t.lemma as string) ?? null,
      translit: (t.translit as string) ?? null,
      morph: (t.morph as string) ?? null,
      gloss: (t.gloss as string) ?? null
    })
  }

  const verses: Verse[] = verseRows.map((r) => ({
    verse: r.verse,
    text: r.text,
    tokens: tokensByVerse.get(r.verse) ?? null
  }))

  return {
    translation: ref.translation,
    book: ref.book,
    chapter: ref.chapter,
    bookName: bookRow?.name ?? ref.book,
    direction: (transRow?.direction as 'ltr' | 'rtl') ?? 'ltr',
    verses
  }
}

export function getStrongs(id: string): StrongsEntry | null {
  const d = required()
  const row = d
    .prepare(
      'SELECT id, language, lemma, translit, pronunciation, definition, kjv_def, derivation FROM strongs_lexicon WHERE id = ?'
    )
    .get(id.toUpperCase()) as Record<string, unknown> | undefined
  if (!row) return null
  const occ = d
    .prepare('SELECT COUNT(*) n FROM verse_tokens WHERE strongs = ?')
    .get(id.toUpperCase()) as { n: number }
  const definition = [row.definition, row.derivation]
    .filter(Boolean)
    .join(' — ')
  return {
    id: row.id as string,
    language: row.language as 'greek' | 'hebrew',
    lemma: (row.lemma as string) ?? '',
    translit: (row.translit as string) ?? '',
    pronunciation: (row.pronunciation as string) ?? null,
    definition,
    kjvDef: (row.kjv_def as string) ?? null,
    occurrences: occ.n
  }
}

/** Every verse where a Strong's number occurs, in canonical order (word-study concordance). */
export function getConcordance(strongs: string, opts: ConcordanceOptions = {}): ConcordanceResponse {
  const d = required()
  const translation = opts.translation ?? 'KJV'
  const sid = strongs.toUpperCase()

  const total = (
    d
      .prepare(
        `SELECT COUNT(*) n FROM (
           SELECT 1 FROM verse_tokens WHERE translation_id = ? AND strongs = ?
           GROUP BY book_id, chapter, verse
         )`
      )
      .get(translation, sid) as { n: number }
  ).n

  const limit = Math.min(opts.limit ?? 300, 1000)
  const offset = opts.offset ?? 0
  const rows = d
    .prepare(
      `SELECT vt.book_id, vt.chapter, vt.verse,
              group_concat(DISTINCT vt.surface) AS surfaces,
              v.text AS text, b.name AS book_name
       FROM verse_tokens vt
       JOIN verses v ON v.translation_id = vt.translation_id AND v.book_id = vt.book_id
                    AND v.chapter = vt.chapter AND v.verse = vt.verse
       JOIN books b ON b.id = vt.book_id
       WHERE vt.translation_id = ? AND vt.strongs = ?
       GROUP BY vt.book_id, vt.chapter, vt.verse
       ORDER BY b.sort_order, vt.chapter, vt.verse
       LIMIT ? OFFSET ?`
    )
    .all(translation, sid, limit, offset) as Record<string, unknown>[]

  const hits: ConcordanceHit[] = rows.map((r) => {
    const surfaces = (r.surfaces as string) ?? ''
    return {
      book: r.book_id as string,
      bookName: r.book_name as string,
      chapter: r.chapter as number,
      verse: r.verse as number,
      surface: surfaces.split(',')[0] ?? '',
      snippet: markSurfaces(r.text as string, surfaces)
    }
  })
  return { total, hits }
}

/** Wrap whole-word occurrences of each surface in {{…}} for emphasis in the UI. */
function markSurfaces(text: string, surfaces: string): string {
  const uniq = [...new Set(surfaces.split(','))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  let out = text
  for (const s of uniq) {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\b(${esc})\\b`, 'gi'), '{{$1}}')
  }
  return out
}

export function search(q: SearchQuery): SearchResponse {
  const d = required()
  const term = q.text.trim()
  if (!term) return { total: 0, hits: [] }

  const filters: string[] = ['verses_fts MATCH ?', 'translation_id = ?']
  const params: string[] = [ftsQuery(term), q.translation]
  if (q.book) {
    filters.push('book_id = ?')
    params.push(q.book)
  } else if (q.testament && q.testament !== 'all') {
    filters.push('book_id IN (SELECT id FROM books WHERE testament = ?)')
    params.push(q.testament)
  }
  const where = filters.join(' AND ')

  const total = (
    d.prepare(`SELECT COUNT(*) n FROM verses_fts WHERE ${where}`).get(...params) as { n: number }
  ).n

  const limit = Math.min(q.limit ?? 100, 300)
  const offset = q.offset ?? 0
  const rows = d
    .prepare(
      `SELECT book_id, chapter, verse,
              snippet(verses_fts, 0, '{{', '}}', '…', 12) AS snip
       FROM verses_fts WHERE ${where}
       ORDER BY rank LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, unknown>[]

  const names = new Map(
    (d.prepare('SELECT id, name, sort_order FROM books').all() as {
      id: string
      name: string
      sort_order: number
    }[]).map((b) => [b.id, b])
  )
  const hits: SearchHit[] = rows.map((r) => ({
    book: r.book_id as string,
    bookName: names.get(r.book_id as string)?.name ?? (r.book_id as string),
    chapter: r.chapter as number,
    verse: r.verse as number,
    snippet: r.snip as string
  }))
  return { total, hits }
}

/** Turn a user query into a safe FTS5 MATCH expression (prefix match on each term). */
function ftsQuery(input: string): string {
  const terms = input
    .replace(/["*]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"`)
  return terms.join(' ')
}
