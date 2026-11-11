import { DatabaseSync } from 'node:sqlite'
import type { VerseLayout } from '../../shared/literaryLayout'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { greekNtEditions, greekScript, hebrewScript, scopedBooks, searchText } from './search'
import { mapPassage } from '../../shared/passageMapping'
import { foldLatinHomoglyphs } from '../../shared/originalText'
import { lexiconId } from '../../shared/lexiconId'
import { splitVerseUnits, unpackTags } from '../../shared/verseUnits'
import { isSourceForm, SOURCE_WORD_ALIGNMENT_VERSION } from '../../shared/sourceWords'
import type {
  Translation,
  ChapterRef,
  VerseRef,
  ChapterContent,
  Verse,
  VerseToken,
  SourceWord,
  StrongsEntry,
  SearchQuery,
  SearchResponse,
  SearchHit,
  ConcordanceOptions,
  ConcordanceResponse,
  Edition,
  InterlinearContent,
  VariantItem,
  VerseVariant,
  LexiconGroup,
  LexiconEntry,
  LexBrowseOptions,
  LexBrowseResult,
  CrossRef,
  VocabItem,
  GrammarLesson
} from '../../shared/types'

let db: DatabaseSync | null = null
let hasVerifiedSourceWords = false
let hasLiteraryLayout = false

function resolveDbPath(): string | null {
  // app.getAppPath() is the app root when launched as `electron .`, but the SCRIPT'S directory when
  // launched as `electron out/main/index.js` — which is how the smoke test used to miss the DB and
  // report 16 phantom failures. Walking up from __dirname (out/main → repo root) and the cwd covers
  // both, on top of the packaged extraResources location.
  const candidates = [
    join(process.resourcesPath ?? '', 'bible.sqlite'),
    join(app.getAppPath(), 'resources', 'bible.sqlite'),
    join(app.getAppPath(), '..', 'resources', 'bible.sqlite'),
    join(__dirname, '..', '..', 'resources', 'bible.sqlite'),
    join(process.cwd(), 'resources', 'bible.sqlite')
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
  hasLiteraryLayout = hasTable('verse_layout')
  hasVerifiedSourceWords = hasTable('source_word_spans') && hasTable('meta') &&
    db.prepare("SELECT value FROM meta WHERE key = 'source_word_alignment_version'").get()?.value === SOURCE_WORD_ALIGNMENT_VERSION
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

  const tokensByVerse = taggedTokens(ref)

  // Translations with no scholarly tagging get inferred tags instead (see derived_tags in
  // schema.sql), materialised into the same token shape and marked `derived`.
  if (tokensByVerse.size === 0) {
    for (const [verse, toks] of derivedTokens(ref.translation, ref.book, ref.chapter, verseRows)) {
      tokensByVerse.set(verse, toks)
    }
  }

  const layout = new Map<number, VerseLayout>()
  if (hasLiteraryLayout) {
    const rows = d.prepare('SELECT verse, marks FROM verse_layout WHERE translation_id=? AND book_id=? AND chapter=?')
      .all(ref.translation, ref.book, ref.chapter)
    for (const row of rows) layout.set(Number(row.verse), JSON.parse(String(row.marks)) as VerseLayout)
  }

  const verses: Verse[] = verseRows.map((r) => ({
    verse: r.verse,
    text: r.text,
    tokens: tokensByVerse.get(r.verse) ?? null,
    layout: layout.get(r.verse)
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

/** Look up a comparison using this edition's native address. Only the two aligned
 * translations need token evidence. All other editions return just their printed text. */
export function getComparisonVerse(ref: VerseRef): Verse | null {
  if (!Number.isSafeInteger(ref.verse) || ref.verse < 1) return null
  const row = required().prepare(
    'SELECT text FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse = ?'
  ).get(ref.translation, ref.book, ref.chapter, ref.verse)
  if (!row) return null
  const withEvidence = hasVerifiedSourceWords && (ref.translation === 'KJV' || ref.translation === 'BSB')
  const tokens = withEvidence ? taggedTokens(ref, ref.verse).get(ref.verse) : null
  return { verse: ref.verse, text: String(row.text), tokens: tokens ?? null }
}

/** Shared scholarly token/span assembly for the reader and a single-verse comparison. */
function taggedTokens(ref: ChapterRef, verseNumber?: number): Map<number, VerseToken[]> {
  const d = required()
  const params = [ref.translation, ref.book, ref.chapter]
  if (verseNumber !== undefined) params.push(verseNumber)
  const tokenRows = d
    .prepare(
      `SELECT verse, position, surface, trailer, strongs, lemma, translit, morph, gloss
       FROM verse_tokens WHERE translation_id = ? AND book_id = ? AND chapter = ?
       ${verseNumber === undefined ? '' : 'AND verse = ?'} ORDER BY verse, position`
    )
    .all(...params) as Record<string, unknown>[]

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

  if (hasVerifiedSourceWords && tokenRows.length && (ref.translation === 'KJV' || ref.translation === 'BSB')) {
    const spans = d.prepare(`SELECT s.verse, s.start_position, s.end_position, s.source_row, s.language,
        b.lemma AS text, b.translit, b.strongs, b.morph
      FROM source_word_spans s JOIN verse_tokens b ON b.translation_id='BSB'
        AND b.book_id=s.book_id AND b.chapter=s.chapter AND b.verse=s.verse AND b.position=s.bsb_position
      WHERE s.translation_id=? AND s.book_id=? AND s.chapter=?
        ${verseNumber === undefined ? '' : 'AND s.verse = ?'}`).all(...params)
    for (const span of spans) {
      const verse = Number(span.verse)
      const endPosition = Number(span.end_position)
      const tokens = tokensByVerse.get(verse)
      const token = tokens?.[endPosition]
      if (!tokens || !token || token.position !== endPosition || !token.strongs || token.strongs !== span.strongs ||
          typeof span.text !== 'string' || typeof span.translit !== 'string' || !span.translit.trim()) continue
      const startPosition = Number(span.start_position)
      if (!Number.isInteger(startPosition) || startPosition < 0 || startPosition > endPosition) continue
      const english = tokens.slice(startPosition, endPosition).map(t => t.surface + t.trailer).join('') + token.surface
      // The publisher sometimes includes sof pasuq and the open/closed section marker in
      // the same field as the Hebrew word. They are typography, not part of its spelling.
      const text = span.language === 'Greek' ? span.text :
        span.text.replace(/׃[פס]$/u, '').replace(/^[־׀׃]+|[־׀׃]+$/gu, '')
      const language = span.language as SourceWord['language']
      if (!isSourceForm(language, text)) continue
      token.sourceWord = {
        edition: 'BSB', language, rowId: String(span.source_row),
        book: ref.book, chapter: ref.chapter, verse, startPosition, endPosition,
        english, text, strongs: token.strongs, morph: String(span.morph ?? ''),
        translit: span.translit, evidence: ref.translation === 'BSB' ? 'aligned' : 'corroborated'
      }
    }
  }
  return tokensByVerse
}

/**
 * Materialise a chapter's inferred tags into tokens. Every consumer — the reader, the interlinear
 * and the concordance — goes through here, so they can't disagree about where one token ends.
 *
 * A run of words marked as continuations collapses into ONE token, the way the scholar-tagged
 * translations are stored. Without that, a phrase the Berean tags as a unit ("of the LORD" →
 * H3068) becomes three tokens all carrying H3068, and Quick Replace substitutes once per token.
 */
function derivedTokens(
  translation: string,
  book: string,
  chapter: number,
  verseRows: { verse: number; text: string }[]
): Map<number, VerseToken[]> {
  const out = new Map<number, VerseToken[]>()
  if (!hasTable('derived_tags')) return out
  const packed = required()
    .prepare(
      'SELECT verse, strongs FROM derived_tags WHERE translation_id = ? AND book_id = ? AND chapter = ?'
    )
    .all(translation, book, chapter) as { verse: number; strongs: string }[]
  for (const row of packed) {
    const text = verseRows.find((v) => v.verse === row.verse)?.text
    if (!text) continue
    out.set(row.verse, decodeDerivedTokens(text, row.strongs))
  }
  return out
}

function decodeDerivedTokens(text: string, packed: string): VerseToken[] {
  const units = splitVerseUnits(text)
  const tags = unpackTags(packed)
  const toks: VerseToken[] = []
  for (let i = 0; i < units.length; ) {
    let j = i + 1
    while (j < units.length && tags[j]?.continues) j++
    let surface = ''
    for (let k = i; k < j; k++) {
      surface += k === j - 1 ? units[k].surface : units[k].surface + units[k].trailer
    }
    toks.push({
      position: toks.length,
      surface,
      trailer: units[j - 1].trailer,
      strongs: tags[i]?.strongs ?? null,
      lemma: null,
      translit: null,
      morph: null,
      gloss: null,
      derived: true
    })
    i = j
  }
  return toks
}

/** Does this translation carry scholarly word tagging of its own? */
function hasRealTagging(translation: string): boolean {
  return !!required()
    .prepare('SELECT 1 FROM verse_tokens WHERE translation_id = ? LIMIT 1')
    .get(translation)
}

export function getStrongs(id: string): StrongsEntry | null {
  const d = required()
  id = lexiconId(id)
  const row = d
    .prepare(
      'SELECT id, language, lemma, translit, pronunciation, definition, kjv_def, derivation FROM strongs_lexicon WHERE id = ?'
    )
    .get(id) as Record<string, unknown> | undefined
  if (!row) {
    const entry = d.prepare('SELECT headword, translit FROM lexicon_entries WHERE strongs=? ORDER BY lexicon,sort,id LIMIT 1')
      .get(id)
    if (!entry) return null
    return { id, language: id.startsWith('H') ? 'hebrew' : 'greek', lemma: String(entry.headword ?? ''),
      translit: String(entry.translit ?? ''), pronunciation: null, definition: '', kjvDef: null,
      occurrences: Number(d.prepare('SELECT COUNT(*) AS n FROM verse_tokens WHERE strongs=?').get(id)?.n ?? 0),
      lexiconSource: 'STEP' }
  }
  const occ = d
    .prepare('SELECT COUNT(*) n FROM verse_tokens WHERE strongs = ?')
    .get(id) as { n: number }
  const definition = [row.definition, row.derivation]
    .filter(Boolean)
    .join(' — ')
  return {
    id: row.id as string,
    language: row.language as 'greek' | 'hebrew',
    ...(row.language === 'hebrew' && /^\s*\(Aramaic\)/i.test(String(row.derivation ?? ''))
      ? { sourceLanguage: 'Aramaic' as const } : {}),
    lemma: (row.lemma as string) ?? '',
    translit: (row.translit as string) ?? '',
    pronunciation: (row.pronunciation as string) ?? null,
    definition,
    kjvDef: (row.kjv_def as string) ?? null,
    occurrences: occ.n
  }
}

/** True if a table exists — lets new-in-0.1.2 queries no-op gracefully before a db:build. */
function hasTable(name: string): boolean {
  return !!required()
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name)
}

/** A GeoJSON layer stored in `meta`. Returns '' (an absent layer) rather than throwing, matching
 *  the other map/study getters, so the Maps view degrades instead of erroring before a db:build. */
function mapLayer(key: string): string {
  if (!isReady() || !hasTable('meta')) return ''
  const r = required().prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return r?.value ?? ''
}

/** Natural Earth land polygons (GeoJSON string) for the offline Maps basemap. */
export function getMapLand(): string {
  return mapLayer('land_geojson')
}

/** Hand-authored, approximate kingdoms/regions overlay (GeoJSON string) for the map time slider. */
export function getMapRegions(): string {
  return mapLayer('regions_geojson')
}

/** Treasury of Scripture Knowledge cross-references for a verse, most-voted first. */
export function getCrossReferences(book: string, chapter: number, verse: number): CrossRef[] {
  if (!hasTable('cross_references')) return []
  const rows = required()
    .prepare(
      `SELECT to_book, to_chapter, to_verse_start, to_verse_end, votes FROM cross_references
       WHERE from_book = ? AND from_chapter = ? AND from_verse = ? ORDER BY votes DESC LIMIT 60`
    )
    .all(book, chapter, verse) as Record<string, unknown>[]
  return rows.map((r) => ({
    ref: `${r.to_book}.${r.to_chapter}.${r.to_verse_start}`,
    toVerseEnd: (r.to_verse_end as number) ?? null,
    votes: r.votes as number
  }))
}

/** Frequency-ranked vocabulary (from the tagged original-language text) for the Learn flashcards. */
export function getVocab(language: 'greek' | 'hebrew', limit = 50, offset = 0): VocabItem[] {
  if (!hasTable('vocab')) return []
  const rows = required()
    .prepare('SELECT * FROM vocab WHERE language = ? ORDER BY frequency DESC LIMIT ? OFFSET ?')
    .all(language, limit, offset) as Record<string, unknown>[]
  return rows.map((r) => ({
    strongs: r.strongs as string,
    language: r.language as 'greek' | 'hebrew',
    lemma: r.lemma as string,
    translit: (r.translit as string) ?? null,
    gloss: (r.gloss as string) ?? null,
    frequency: r.frequency as number,
    testament: r.testament as 'OT' | 'NT'
  }))
}

function mapLesson(r: Record<string, unknown>): GrammarLesson {
  return {
    id: r.id as number,
    course: r.course as string,
    chapterNo: r.chapter_no as number,
    title: r.title as string,
    bodyMd: (r.body_md as string) ?? '',
    vocab: JSON.parse((r.vocab_json as string) || '[]'),
    readings: JSON.parse((r.readings_json as string) || '[]'),
    exercises: JSON.parse((r.exercises_json as string) || '[]')
  }
}

/** All interactive grammar lessons (our original read-early Greek & Hebrew courses), in order. */
export function getGrammarLessons(): GrammarLesson[] {
  if (!hasTable('grammar_lessons')) return []
  return (
    required()
      .prepare('SELECT * FROM grammar_lessons ORDER BY sort, chapter_no')
      .all() as Record<string, unknown>[]
  ).map(mapLesson)
}

export function getGrammarLesson(id: number): GrammarLesson | null {
  if (!hasTable('grammar_lessons')) return null
  const r = required().prepare('SELECT * FROM grammar_lessons WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return r ? mapLesson(r) : null
}

/** Browse the historical and extended dictionaries together, one row per headword ID. */
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
    const script = hebrewScript.test(query) ? normHebrewWord(query) : greekScript.test(query) ? normGreekWord(query) : ''
    filters.push('(id LIKE ? OR translit LIKE ? OR lemma LIKE ? OR gloss LIKE ? OR definition LIKE ?' +
      (script ? ' OR lookup_form LIKE ?)' : ')'))
    const like = `%${query}%`
    params.push('%' + lexiconId(query) + '%', like, like, like, like)
    if (script) params.push('%' + script + '%')
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const total = (d.prepare(`SELECT COUNT(*) n FROM lexicon_headwords ${where}`).get(...params) as {
    n: number
  }).n
  const limit = Math.min(opts.limit ?? 120, 400)
  const offset = opts.offset ?? 0
  const rows = d
    .prepare(
      `SELECT id, language, lemma, translit, gloss, definition FROM lexicon_headwords ${where}
       ORDER BY language, CAST(substr(id, 2) AS INTEGER) LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, unknown>[]
  const entries = rows.map((r) => {
    const gloss = ((r.gloss as string) || (r.definition as string) || '')
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
  // Must fold exactly as data-pipeline/lib.ts normGreek does, or a word looked up at runtime
  // won't match the keys written into form_parses at build time.
  return foldLatinHomoglyphs(s)
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
  const id = lexiconId(strongs)
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

/** Return the exact tagged occurrences, even when two different lemmas share an English spelling. */
export function getConcordance(strongs: string, opts: ConcordanceOptions = {}): ConcordanceResponse {
  const d = required()
  const sid = lexiconId(strongs)
  const requested = opts.translation ?? 'KJV'
  const original = ['MT', 'LXX', 'NA', 'TR', 'BYZ'].includes(requested)
  const tagged = !original && hasRealTagging(requested)
  const inferred = !original && !tagged && hasTable('derived_tags') &&
    !!d.prepare('SELECT 1 FROM derived_tags WHERE translation_id = ? LIMIT 1').get(requested)
  // The lexicon labels its KJV fallback for translations without word tagging.
  const translation = original || inferred || tagged ? requested : 'KJV'
  const books = scopedBooks(opts)
  const result: ConcordanceResponse = { translation, derived: inferred, total: 0, hits: [] }
  if (books?.length === 0) return result

  const source = inferred ? 'derived_tags' : original ? 'original_tokens' : 'verse_tokens'
  const editionColumn = original ? 'edition' : 'translation_id'
  const match = inferred ? "' ' || t.strongs || ' ' LIKE ?" : 't.strongs = ?'
  const params = [translation, inferred ? `% ${sid} %` : sid, ...(books ?? [])]
  const scope = books ? ` AND t.book_id IN (${books.map(() => '?').join(',')})` : ''
  const refs = `SELECT DISTINCT t.book_id, t.chapter, t.verse FROM ${source} t
    WHERE t.${editionColumn} = ? AND ${match}${scope}`
  result.total = Number(d.prepare(`SELECT COUNT(*) AS n FROM (${refs})`).get(...params)?.n)
  const page = d.prepare(`SELECT r.*, b.name FROM (${refs}) r JOIN books b ON b.id=r.book_id
    ORDER BY b.sort_order, r.chapter, r.verse LIMIT ? OFFSET ?`)
    .all(...params, Math.max(0, Math.min(opts.limit ?? 300, 1000)), Math.max(0, opts.offset ?? 0))
  const verseWords = original ? 'original AS surface, strongs' : 'surface, trailer, strongs'
  const read = inferred
    ? d.prepare(`SELECT v.text, t.strongs FROM derived_tags t JOIN verses v
          USING (translation_id,book_id,chapter,verse)
          WHERE t.translation_id=? AND t.book_id=? AND t.chapter=? AND t.verse=?`)
    : d.prepare(`SELECT ${verseWords} FROM ${source} WHERE ${editionColumn}=? AND book_id=?
          AND chapter=? AND verse=? ORDER BY position`)
  for (const ref of page) {
    const key = [translation, ref.book_id, ref.chapter, ref.verse]
    let tokens: { surface: string; trailer?: string; strongs: string | null }[]
    if (inferred) {
      const row = read.get(...key)
      if (!row) continue
      tokens = decodeDerivedTokens(String(row.text), String(row.strongs))
    } else {
      tokens = read.all(...key) as typeof tokens
    }
    const snippet = tokens.map((t, i) =>
      (t.strongs === sid ? `{{${t.surface}}}` : t.surface) + (t.trailer ?? (i + 1 < tokens.length ? ' ' : ''))
    ).join('')
    result.hits.push({ book: String(ref.book_id), bookName: String(ref.name),
      chapter: Number(ref.chapter), verse: Number(ref.verse), snippet,
      surface: tokens.find(t => t.strongs === sid)?.surface ?? '' })
  }
  return result
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

  // Compare the corresponding native verses. A single LXX chapter can span two English chapters.
  const linesByVerse = new Map<number, NonNullable<InterlinearContent['verses'][number]['lines']>>()
  for (const tid of translations) {
    const chapters = new Map<string, Map<number, Verse>>()
    for (const [verse, tokens] of byVerse) {
      const target = mapPassage({ book, chapter, verse }, edition, tid)
      if (!target) continue
      const key = `${target.book}.${target.chapter}`
      let verses = chapters.get(key)
      if (!verses) {
        const data = getChapter({ ...target, translation: tid })
        verses = new Map(data.verses.map(v => [v.verse, v]))
        chapters.set(key, verses)
      }
      const text = verses.get(target.verse)
      if (!text) continue
      const words = new Map<string, string[]>()
      for (const t of text.tokens ?? []) {
        if (!t.strongs) continue
        const queue = words.get(t.strongs)
        if (queue) queue.push(t.surface)
        else words.set(t.strongs, [t.surface])
      }
      let aligned = false
      for (const tok of tokens) {
        const word = tok.strongs ? words.get(tok.strongs)?.shift() : undefined
        if (word) {
          tok.aligned = { ...tok.aligned, [tid]: word }
          aligned = true
        }
      }
      if (!aligned) {
        const lines = linesByVerse.get(verse) ?? []
        const ref = target.chapter !== chapter || target.verse !== verse ? `${target.chapter}:${target.verse}` : undefined
        lines.push({ id: tid, text: text.text, ref })
        linesByVerse.set(verse, lines)
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
  const term = q.text.trim()
  const strongs = /^([GH])0*(\d{1,5})[a-z]?$/i.exec(term)
  if (strongs) {
    const sid = strongs[1].toUpperCase() + Number(strongs[2])
    const result = getConcordance(sid, { ...q, limit: q.limit ?? 150 })
    if (result.translation !== q.translation) {
      return { total: 0, hits: [], notice: 'This translation has no Strong’s word tags.' }
    }
    const edition = greekNtEditions.has(result.translation) ? result.translation : undefined
    return { total: result.total, hits: result.hits.map(h => ({ ...h, translation: result.translation, edition })) }
  }
  let translations = [q.translation]
  if (greekScript.test(term) && q.translation !== 'LXX' && !greekNtEditions.has(q.translation)) {
    translations = ['LXX', q.greekEdition && greekNtEditions.has(q.greekEdition) ? q.greekEdition : 'NA']
  } else if (hebrewScript.test(term)) {
    translations = ['MT']
  }
  return searchText(required(), 'verses_fts', translations, q)
}

/** How many verses a translation actually has. Editions differ (MT 21,178 · LXX 22,694 · KJV
 *  31,102), so the semantic index must measure completeness against the real total. */
export function verseCount(translation: string): number {
  if (!isReady()) return 0
  return (
    required().prepare('SELECT COUNT(*) n FROM verses WHERE translation_id = ?').get(translation) as {
      n: number
    }
  ).n
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
