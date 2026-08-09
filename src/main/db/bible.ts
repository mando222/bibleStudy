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
  ConcordanceHit,
  Edition,
  InterlinearContent,
  VariantItem,
  VerseVariant,
  LexiconGroup,
  LexiconEntry,
  LexBrowseOptions,
  LexBrowseResult
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

/** The bundled DB handle (opening it if needed), for sibling query modules. Null if absent. */
export function bibleDb(): DatabaseSync | null {
  if (!db) openBibleDb()
  return db
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

/** Browse the Strong's lexicon by hand: filter by language, search by number/translit/lemma/gloss. */
export function browseLexicon(opts: LexBrowseOptions): LexBrowseResult {
  const d = required()
  const filters: string[] = []
  const params: (string | number)[] = []
  if (opts.language === 'greek' || opts.language === 'hebrew') {
    filters.push('language = ?')
    params.push(opts.language)
  }
  const query = (opts.query ?? '').trim()
  if (query) {
    filters.push('(id LIKE ? OR translit LIKE ? OR lemma LIKE ? OR kjv_def LIKE ? OR definition LIKE ?)')
    const like = `%${query}%`
    params.push(like, like, like, like, like)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const total = (d.prepare(`SELECT COUNT(*) n FROM strongs_lexicon ${where}`).get(...params) as {
    n: number
  }).n
  const limit = Math.min(opts.limit ?? 120, 400)
  const offset = opts.offset ?? 0
  const rows = d
    .prepare(
      `SELECT id, language, lemma, translit, kjv_def, definition FROM strongs_lexicon ${where}
       ORDER BY language, CAST(substr(id, 2) AS INTEGER) LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, unknown>[]
  const entries = rows.map((r) => {
    const gloss = ((r.kjv_def as string) || (r.definition as string) || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      id: r.id as string,
      language: r.language as string,
      lemma: (r.lemma as string) ?? '',
      translit: (r.translit as string) ?? '',
      gloss: gloss.length > 90 ? gloss.slice(0, 90) + '…' : gloss
    }
  })
  return { total, entries }
}

// Extra lexicons keyed to Strong's, filtered to the ones matching the word's language.
const LEX_META: Record<string, { name: string; basedOn: string; lang: 'greek' | 'hebrew'; order: number }> = {
  TBESG: { name: 'Abbott-Smith', basedOn: 'Abbott-Smith · Greek NT (STEPBible, CC BY)', lang: 'greek', order: 1 },
  TBESH: { name: 'BDB', basedOn: 'Brown-Driver-Briggs · Hebrew OT (STEPBible, CC BY)', lang: 'hebrew', order: 1 },
  TFLSJ: { name: 'LSJ', basedOn: 'Liddell-Scott-Jones · Greek (STEPBible, CC BY)', lang: 'greek', order: 2 }
}

function normGreekWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics/breathing/accents
    .toLowerCase()
    .replace(/[^α-ω]/g, '') // keep lowercase Greek letters only
    .replace(/ς/g, 'σ') // final sigma → sigma
}
function normHebrewWord(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // cantillation + vowel points
    .replace(/[^א-ת]/g, '') // keep consonants only
}

/**
 * Resolve an original-language WORD (Greek/Hebrew surface) to a Strong's number by matching its
 * form against lexicon lemmas/headwords, so a word with no Strong's tag can still open the lexicon.
 * Exact (accent-insensitive) match — best for dictionary-form words; inflected forms may not resolve
 * without a full morphological analyser. Returns null when nothing matches.
 */
export function getLexiconByWord(word: string): string | null {
  const d = required()
  const isHeb = /[֐-׿]/.test(word)
  const norm = isHeb ? normHebrewWord : normGreekWord
  const key = norm(word)
  if (!key) return null
  const lang = isHeb ? 'hebrew' : 'greek'
  const rows = d
    .prepare('SELECT id, lemma FROM strongs_lexicon WHERE language = ?')
    .all(lang) as { id: string; lemma: string | null }[]
  for (const r of rows) if (r.lemma && norm(r.lemma) === key) return r.id
  const lrows = d
    .prepare('SELECT strongs, headword FROM lexicon_entries WHERE strongs LIKE ?')
    .all(isHeb ? 'H%' : 'G%') as { strongs: string; headword: string | null }[]
  for (const r of lrows) if (r.headword && norm(r.headword) === key) return r.strongs
  return null
}

/** Scholarly-lexicon entries (BDB / Abbott-Smith / LSJ) for a Strong's number, grouped by lexicon. */
export function getLexiconEntries(strongs: string): LexiconGroup[] {
  const id = strongs.toUpperCase()
  const lang: 'greek' | 'hebrew' = id.startsWith('H') ? 'hebrew' : 'greek'
  const rows = required()
    .prepare(
      `SELECT lexicon, ext_key, headword, translit, gloss, body
       FROM lexicon_entries WHERE strongs = ? ORDER BY lexicon, sort`
    )
    .all(id) as Record<string, unknown>[]
  const groups = new Map<string, LexiconGroup>()
  for (const r of rows) {
    const lex = r.lexicon as string
    const meta = LEX_META[lex]
    if (!meta || meta.lang !== lang) continue
    let g = groups.get(lex)
    if (!g) {
      g = { lexicon: lex, name: meta.name, basedOn: meta.basedOn, entries: [] }
      groups.set(lex, g)
    }
    const entry: LexiconEntry = {
      extKey: (r.ext_key as string) ?? null,
      headword: (r.headword as string) ?? null,
      translit: (r.translit as string) ?? null,
      gloss: (r.gloss as string) ?? null,
      body: (r.body as string) ?? ''
    }
    g.entries.push(entry)
  }
  return [...groups.values()].sort((a, b) => LEX_META[a.lexicon].order - LEX_META[b.lexicon].order)
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

export function listEditions(): Edition[] {
  if (!isReady()) return []
  const rows = required()
    .prepare('SELECT id, name, language, testament FROM editions ORDER BY sort_order')
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    language: r.language as string,
    testament: r.testament as 'OT' | 'NT'
  }))
}

/** The interlinear backbone for a chapter in a chosen original-language edition. */
export function getInterlinear(
  book: string,
  chapter: number,
  edition: string,
  translations: string[] = [],
  includeParses = false
): InterlinearContent {
  const d = required()
  const ed = d.prepare('SELECT language FROM editions WHERE id = ?').get(edition) as
    | { language: string }
    | undefined
  const direction = ed?.language === 'hbo' ? 'rtl' : 'ltr'
  const lang = ed?.language === 'hbo' ? 'hebrew' : 'greek'

  const rows = d
    .prepare(
      `SELECT verse, position, original, translit, strongs, morph, gloss
       FROM original_tokens WHERE edition = ? AND book_id = ? AND chapter = ? ORDER BY verse, position`
    )
    .all(edition, book, chapter) as Record<string, unknown>[]

  const byVerse = new Map<number, InterlinearContent['verses'][number]['tokens']>()
  for (const r of rows) {
    const v = r.verse as number
    if (!byVerse.has(v)) byVerse.set(v, [])
    byVerse.get(v)!.push({
      position: r.position as number,
      surface: (r.gloss as string) ?? '', // English gloss under the word
      trailer: ' ',
      strongs: (r.strongs as string) ?? null,
      lemma: r.original as string, // the Greek/Hebrew word (shown prominently)
      translit: (r.translit as string) ?? null,
      morph: (r.morph as string) ?? null,
      gloss: (r.gloss as string) ?? null
    })
  }

  // Stack translations. Strong's-tagged ones (KJV, BSB) align word-for-word by matching Strong's
  // within a verse; untagged ones (WEB, YLT, Julia Smith, …) show as a verse line beneath the grid.
  const linesByVerse = new Map<number, { id: string; text: string }[]>()
  for (const tid of translations) {
    const tagged = !!d
      .prepare('SELECT 1 FROM verse_tokens WHERE translation_id = ? LIMIT 1')
      .get(tid)
    if (tagged) {
      const trows = d
        .prepare(
          `SELECT verse, surface, strongs FROM verse_tokens
           WHERE translation_id = ? AND book_id = ? AND chapter = ? AND strongs IS NOT NULL
           ORDER BY verse, position`
        )
        .all(tid, book, chapter) as { verse: number; surface: string; strongs: string }[]
      const queues = new Map<number, Map<string, string[]>>()
      for (const r of trows) {
        let q = queues.get(r.verse)
        if (!q) {
          q = new Map()
          queues.set(r.verse, q)
        }
        const arr = q.get(r.strongs)
        if (arr) arr.push(r.surface)
        else q.set(r.strongs, [r.surface])
      }
      for (const [verse, tokens] of byVerse) {
        const q = queues.get(verse)
        if (!q) continue
        for (const tok of tokens) {
          if (!tok.strongs) continue
          const w = q.get(tok.strongs)?.shift()
          if (w) tok.aligned = { ...(tok.aligned ?? {}), [tid]: w }
        }
      }
    } else {
      const vrows = d
        .prepare('SELECT verse, text FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ?')
        .all(tid, book, chapter) as { verse: number; text: string }[]
      for (const r of vrows) {
        const arr = linesByVerse.get(r.verse) ?? []
        arr.push({ id: tid, text: r.text })
        linesByVerse.set(r.verse, arr)
      }
    }
  }

  // "All parses": attach every Scripture-attested analysis of each word's form (scholar-tagged).
  if (includeParses) {
    const norm = lang === 'hebrew' ? normHebrewWord : normGreekWord
    const stmt = d.prepare(
      'SELECT strongs, morph, gloss, count FROM form_parses WHERE form = ? AND lang = ? ORDER BY count DESC'
    )
    const cache = new Map<string, { strongs: string | null; morph: string | null; gloss: string | null; count: number }[]>()
    for (const [, tokens] of byVerse) {
      for (const tok of tokens) {
        const form = norm(tok.lemma ?? '')
        if (!form) continue
        let parses = cache.get(form)
        if (!parses) {
          parses = stmt.all(form, lang) as {
            strongs: string | null
            morph: string | null
            gloss: string | null
            count: number
          }[]
          cache.set(form, parses)
        }
        if (parses.length) tok.parses = parses
      }
    }
  }

  const verses = [...byVerse.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([verse, tokens]) => ({ verse, tokens, lines: linesByVerse.get(verse) }))

  return { book, chapter, edition, direction, verses }
}

interface Lite {
  surface: string
  strongs: string | null
  translit: string | null
  gloss: string | null
}

function chapterTokensByVerse(edition: string, book: string, chapter: number): Map<number, Lite[]> {
  const rows = required()
    .prepare(
      'SELECT verse, original, translit, strongs, gloss FROM original_tokens WHERE edition = ? AND book_id = ? AND chapter = ? ORDER BY verse, position'
    )
    .all(edition, book, chapter) as Record<string, unknown>[]
  const map = new Map<number, Lite[]>()
  for (const r of rows) {
    const v = r.verse as number
    if (!map.has(v)) map.set(v, [])
    map.get(v)!.push({
      surface: r.original as string,
      strongs: (r.strongs as string) ?? null,
      translit: (r.translit as string) ?? null,
      gloss: (r.gloss as string) ?? null
    })
  }
  return map
}

/** LCS diff of two verse word-lists, keyed by Strong's (fallback surface). */
function diffVerse(a: Lite[], b: Lite[]): VariantItem[] {
  const ka = a.map((t) => t.strongs || t.surface)
  const kb = b.map((t) => t.strongs || t.surface)
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const item = (t: Lite, side: VariantItem['side']): VariantItem => ({
    surface: t.surface,
    strongs: t.strongs,
    translit: t.translit,
    gloss: t.gloss,
    side
  })
  const out: VariantItem[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (ka[i] === kb[j]) {
      out.push(item(a[i], 'both'))
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(item(a[i], 'critical'))
      i++
    } else {
      out.push(item(b[j], 'tr'))
      j++
    }
  }
  while (i < m) out.push(item(a[i++], 'critical'))
  while (j < n) out.push(item(b[j++], 'tr'))
  return out
}

/** OT apparatus: the Ketiv (written) beside the Qere (read) for each verse that has one. */
function otApparatus(book: string, chapter: number): VerseVariant[] {
  const rows = required()
    .prepare(
      'SELECT verse, qere, ketiv, strongs FROM ketiv_qere WHERE book_id = ? AND chapter = ? ORDER BY verse, position'
    )
    .all(book, chapter) as { verse: number; qere: string; ketiv: string; strongs: string | null }[]
  const byVerse = new Map<number, VariantItem[]>()
  for (const r of rows) {
    if (!byVerse.has(r.verse)) byVerse.set(r.verse, [])
    const items = byVerse.get(r.verse)!
    items.push({ surface: r.qere, strongs: r.strongs, translit: null, gloss: null, side: 'qere' })
    items.push({ surface: r.ketiv, strongs: r.strongs, translit: null, gloss: null, side: 'ketiv' })
  }
  return [...byVerse.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([verse, items]) => ({ verse, items }))
}

/**
 * Textual apparatus for a chapter. OT → Ketiv/Qere (Masoretic scribal variants); NT → where the
 * Critical (NA) and Textus Receptus Greek differ.
 */
export function getChapterApparatus(book: string, chapter: number): VerseVariant[] {
  const testament = (
    required().prepare('SELECT testament FROM books WHERE id = ?').get(book) as
      | { testament?: string }
      | undefined
  )?.testament
  if (testament === 'OT') return otApparatus(book, chapter)

  const na = chapterTokensByVerse('NA', book, chapter)
  const tr = chapterTokensByVerse('TR', book, chapter)
  if (na.size === 0 && tr.size === 0) return []
  const verses = [...new Set([...na.keys(), ...tr.keys()])].sort((x, y) => x - y)
  const out: VerseVariant[] = []
  for (const v of verses) {
    const items = diffVerse(na.get(v) ?? [], tr.get(v) ?? [])
    if (items.some((it) => it.side !== 'both')) out.push({ verse: v, items })
  }
  return out
}

export function search(q: SearchQuery): SearchResponse {
  const d = required()
  const term = q.text.trim()
  if (!term) return { total: 0, hits: [] }

  // A Strong's number (e.g. "G26", "H0430", "g26") → every occurrence, via the concordance.
  const sm = /^([GgHh])0*(\d{1,5})[a-zA-Z]?$/.exec(term)
  if (sm) {
    const { total, hits } = getConcordance(`${sm[1].toUpperCase()}${Number(sm[2])}`, {
      limit: q.limit ?? 150,
      offset: q.offset
    })
    return {
      total,
      hits: hits.map((h) => ({
        book: h.book,
        bookName: h.bookName,
        chapter: h.chapter,
        verse: h.verse,
        snippet: h.snippet
      }))
    }
  }

  // Greek or Hebrew script in the query → search the matching original-language edition (Septuagint
  // / Masoretic) regardless of the current translation, so original-word search "just works". The
  // query is accent/point-folded to match the folded original-language FTS index.
  const isGreek = /[Ͱ-Ͽἀ-῿]/.test(term)
  const isHebrew = /[֐-׿]/.test(term)
  const translation = isGreek ? 'LXX' : isHebrew ? 'MT' : q.translation
  const ftsTerm =
    isGreek || isHebrew
      ? term
          .normalize('NFD')
          .replace(/[̀-֑ͯ-ׇ]/g, '')
          .toLowerCase()
          .replace(/ς/g, 'σ')
      : term

  const filters: string[] = ['verses_fts MATCH ?', 'translation_id = ?']
  const params: string[] = [ftsQuery(ftsTerm), translation]
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

/** All verses of a translation (for building the semantic index). */
export function allVerses(
  translation: string
): { book: string; chapter: number; verse: number; text: string }[] {
  return required()
    .prepare('SELECT book_id AS book, chapter, verse, text FROM verses WHERE translation_id = ?')
    .all(translation) as { book: string; chapter: number; verse: number; text: string }[]
}

/** OR-retrieval over verses for the AI assistant: any of the keywords, ranked. */
export function retrieveByKeywords(
  translation: string,
  keywords: string[],
  limit = 10
): SearchHit[] {
  if (keywords.length === 0) return []
  const d = required()
  const q = keywords.map((k) => `"${k.replace(/"/g, '')}"`).join(' OR ')
  const rows = d
    .prepare(
      `SELECT book_id, chapter, verse, snippet(verses_fts, 0, '', '', '…', 20) AS snip
       FROM verses_fts WHERE verses_fts MATCH ? AND translation_id = ? ORDER BY rank LIMIT ?`
    )
    .all(q, translation, limit) as Record<string, unknown>[]
  const names = new Map(
    (d.prepare('SELECT id, name FROM books').all() as { id: string; name: string }[]).map((b) => [
      b.id,
      b.name
    ])
  )
  return rows.map((r) => ({
    book: r.book_id as string,
    bookName: names.get(r.book_id as string) ?? (r.book_id as string),
    chapter: r.chapter as number,
    verse: r.verse as number,
    snippet: r.snip as string
  }))
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
