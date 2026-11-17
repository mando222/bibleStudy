import type { ReadingChapter } from '../../shared/types'
import { readChapterApparatus, readOriginalVerse } from './apparatus'
import { greekOrderStatusSql } from './greekOrder'
import type { DatabaseSync } from 'node:sqlite'
import { openCorpus } from './openCorpus'
import type { VerseLayout } from '../../shared/literaryLayout'
import { greekNtEditions, greekScript, hebrewScript, scopedBooks, searchText } from './search'
import { mapPassage } from '../../shared/passageMapping'
import { foldLatinHomoglyphs } from '../../shared/originalText'
import { sweteReadingIssue } from '../../shared/lxxIntegrity'
import { lexiconId, lexiconLanguage } from '../../shared/lexiconId'
import { splitVerseUnits, unpackTags } from '../../shared/verseUnits'
import { SOURCE_WORD_ALIGNMENT_VERSION, validSourceWitness } from '../../shared/sourceWords'
import { countSourceSpans, publisherForm } from './sourceWordCoverage'
import type {
  Translation,
  ChapterRef,
  VerseRef,
  ChapterContent,
  Verse,
  VerseToken,
  SourceWord,
  SourceWitness,
  SourceWordCoverage,
  StrongsEntry,
  SearchQuery,
  SearchResponse,
  SearchHit,
  ConcordanceOptions,
  ConcordanceResponse,
  Edition,
  InterlinearContent,
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
let hasEditionPacks = false
let hasCorrespondences = false
let hasSourceSingletons = false
let hasInterlinearRows = false
let hasSourceCoverage = false
const legacyCoverage = new Map<string, SourceWordCoverage[]>()
let hasLiteraryLayout = false
let hasMasoreticSourceTypes = false
let hasKetivPairs = false
let hasGreekOrderReview = false

/** Open the bundled DB read-only. Returns false if it hasn't been built yet. */
export function openBibleDb(): boolean {
  if (db) return true
  db = openCorpus()
  if (!db) return false
  hasLiteraryLayout = hasTable('verse_layout')
  hasMasoreticSourceTypes = db.prepare("SELECT 1 FROM pragma_table_info('original_tokens') WHERE name='source_type'").get() !== undefined
  hasKetivPairs = hasTable('ketiv_qere')
  hasGreekOrderReview = hasTable('greek_order_uncertainties')
  hasVerifiedSourceWords = hasTable('source_word_spans') && hasTable('meta') &&
    db.prepare("SELECT value FROM meta WHERE key = 'source_word_alignment_version'").get()?.value === SOURCE_WORD_ALIGNMENT_VERSION
  hasEditionPacks = hasTable('edition_occurrences') && hasTable('edition_token_evidence') && hasTable('meta') &&
    db.prepare("SELECT value FROM meta WHERE key='edition_pack_version'").get()?.value === '1'
  hasCorrespondences = hasEditionPacks && hasTable('edition_correspondences')
  hasSourceSingletons = hasVerifiedSourceWords && hasTable('source_word_singletons')
  hasInterlinearRows = hasVerifiedSourceWords && hasTable('interlinear_source_rows')
  hasSourceCoverage = (hasVerifiedSourceWords || hasEditionPacks) && hasTable('source_word_coverage')
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

export function getSourceWordCoverage(input: string): SourceWordCoverage[] {
  const id = typeof input === 'string' ? lexiconId(input) : ''
  if (!/^[GH][1-9]\d*$/.test(id) || !isReady() || (!hasVerifiedSourceWords && !hasEditionPacks)) return []
  const d = required()
  if (hasSourceCoverage) {
    return d.prepare(`SELECT translation_id AS translation, occurrences FROM source_word_coverage
      WHERE strongs=? ORDER BY translation_id`).all(id) as unknown as SourceWordCoverage[]
  }
  const cached = legacyCoverage.get(id)
  if (cached) return cached
  const result = Array.from(countSourceSpans(d, id).get(id) ?? [], ([translation, occurrences]) =>
    ({ translation, occurrences }))
  legacyCoverage.set(id, result)
  return result
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

function readingSource(edition: string, interlinear: boolean) {
  return interlinear || greekNtEditions.has(edition)
    ? 'original_tokens WHERE edition = ?' : 'verses WHERE translation_id = ?'
}

/** Enumerate recorded chapters, including partial editions and edition-specific numbering. */
export function listReadingChapters(edition: string, interlinear: boolean): ReadingChapter[] {
  const source = readingSource(edition, interlinear)
  return required().prepare(`SELECT book_id AS book, chapter, MIN(verse) AS firstVerse FROM ${source} GROUP BY book_id, chapter`).all(edition) as ReadingChapter[]
}

/** Exact reader addresses, including superscriptions and gaps in an edition. */
export function listReadingVerses(ref: ChapterRef, interlinear: boolean): number[] {
  const source = readingSource(ref.translation, interlinear)
  return required().prepare(`SELECT DISTINCT verse FROM ${source} AND book_id = ? AND chapter = ? ORDER BY verse`)
    .all(ref.translation, ref.book, ref.chapter).map(row => Number(row.verse))
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
  const missing = verseRows.filter(v => !tokensByVerse.has(v.verse))
  if (missing.length) {
    for (const [verse, toks] of derivedTokens(ref.translation, ref.book, ref.chapter, missing)) {
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

/** Compare the native verse and any verified occurrence links this edition supplies. */
export function getComparisonVerse(ref: VerseRef): Verse | null {
  if (!Number.isSafeInteger(ref.verse) || ref.verse < 1) return null
  const row = required().prepare(
    'SELECT text FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse = ?'
  ).get(ref.translation, ref.book, ref.chapter, ref.verse)
  if (!row) return null
  const withEvidence = hasEditionPacks || (hasVerifiedSourceWords && (ref.translation === 'KJV' || ref.translation === 'BSB'))
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
         ${hasEditionPacks ? ', e.kind, e.citation' : ''}
       FROM verse_tokens ${hasEditionPacks
         ? 'LEFT JOIN edition_token_evidence e USING(translation_id,book_id,chapter,verse,position)' : ''}
       WHERE translation_id = ? AND book_id = ? AND chapter = ?
       ${verseNumber === undefined ? '' : 'AND verse = ?'} ORDER BY verse, position`
    )
    .all(...params) as Record<string, unknown>[]

  const tokensByVerse = new Map<number, VerseToken[]>()
  for (const t of tokenRows) {
    const v = t.verse as number
    if (!tokensByVerse.has(v)) tokensByVerse.set(v, [])
    tokensByVerse.get(v)!.push({
      ...(t.kind === 'inferred' ? { derived: true } : {}),
      ...(typeof t.citation === 'string' ? { tagCitation: t.citation } : {}),
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

  if (tokenRows.length && (hasEditionPacks || (hasVerifiedSourceWords && ['BSB', 'KJV'].includes(ref.translation)))) {
    const spans = d.prepare(hasEditionPacks ? `SELECT *, form AS text FROM edition_occurrences s
      WHERE translation_id=? AND book_id=? AND chapter=? ${verseNumber === undefined ? '' : 'AND verse=?'}` : `SELECT s.verse, s.start_position, s.end_position, s.source_row, s.language,
        b.lemma AS text, b.translit, b.strongs, b.morph,
        ${hasSourceSingletons ? 'cert.source_row IS NOT NULL' : '0'} AS standalone
      FROM source_word_spans s JOIN verse_tokens b ON b.translation_id='BSB'
        AND b.book_id=s.book_id AND b.chapter=s.chapter AND b.verse=s.verse AND b.position=s.bsb_position
      ${hasSourceSingletons ? `LEFT JOIN source_word_singletons cert ON cert.translation_id=s.translation_id
        AND cert.book_id=s.book_id AND cert.chapter=s.chapter AND cert.verse=s.verse AND cert.position=s.end_position
        AND s.start_position=s.end_position AND cert.source_row=s.source_row` : ''}
      WHERE s.translation_id=? AND s.book_id=? AND s.chapter=?
        ${verseNumber === undefined ? '' : 'AND s.verse = ?'}`).all(...params)
    for (const span of spans) {
      const verse = Number(span.verse)
      const endPosition = Number(span.end_position)
      const tokens = tokensByVerse.get(verse)
      const token = tokens?.[endPosition]
      if (!tokens || !token || token.position !== endPosition || !token.strongs || token.strongs !== span.strongs ||
          token.derived || typeof span.text !== 'string' || (!hasEditionPacks && !String(span.translit ?? '').trim())) continue
      const startPosition = Number(span.start_position)
      if (!Number.isInteger(startPosition) || startPosition < 0 || startPosition > endPosition) continue
      const english = tokens.slice(startPosition, endPosition).map(t => t.surface + t.trailer).join('') + token.surface
      const language = span.language as SourceWord['language']
      const text = publisherForm(span.text, language)
      if (!text || (hasEditionPacks && span.english !== english) ||
          tokens.slice(startPosition, endPosition).some(t => t.strongs || t.derived || t.sourceWord)) continue
      const source: SourceWord = {
        ...(hasEditionPacks ? {
          translation: ref.translation, sourceRevision: String(span.source_revision ?? ''),
          citation: String(span.citation ?? ''), uniqueForm: span.unique_form === 1, preservePreset: span.preserve_preset === 1,
          sourceRef: { book: String(span.source_book ?? ''), chapter: Number(span.source_chapter), verse: Number(span.source_verse),
            ...(span.source_position == null ? {} : { position: Number(span.source_position) }) }
        } : {}),
        edition: hasEditionPacks ? String(span.source_edition ?? '') : 'BSB', language, rowId: String(span.source_row ?? ''),
        book: ref.book, chapter: ref.chapter, verse, startPosition, endPosition,
        english, text, strongs: token.strongs, morph: String(span.morph ?? ''),
        translit: String(span.translit ?? ''), evidence: hasEditionPacks ? span.evidence as SourceWord['evidence']
          : ref.translation === 'BSB' ? 'aligned' : 'corroborated',
        canReplaceAlone: span.standalone === 1
      }
      if (validSourceWitness(source, ref.translation)) token.sourceWord = source
    }
  }
  if (hasCorrespondences && tokenRows.length) {
    const links = d.prepare(`SELECT verse, end_position, source_edition, source_revision, source_book, source_chapter,
        source_verse, source_row, source_position, citation FROM edition_correspondences
      WHERE translation_id=? AND book_id=? AND chapter=? ${verseNumber === undefined ? '' : 'AND verse=?'}`).all(...params)
    for (const r of links) {
      const word = tokensByVerse.get(Number(r.verse))?.[Number(r.end_position)]?.sourceWord
      if (!word) continue
      const link: SourceWitness = { edition: String(r.source_edition), rowId: String(r.source_row),
        sourceRevision: String(r.source_revision), citation: String(r.citation),
        sourceRef: { book: String(r.source_book), chapter: Number(r.source_chapter), verse: Number(r.source_verse),
          ...(r.source_position == null ? {} : { position: Number(r.source_position) }) } }
      if (word.correspondences) word.correspondences.push(link)
      else word.correspondences = [link]
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
  const query = (opts.query ?? '').trim()
  const idLanguage = lexiconLanguage(query)
  const language = idLanguage ?? opts.language
  if (language === 'greek' || language === 'hebrew') {
    filters.push('language = ?')
    params.push(language)
  }
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
  const exactFirst = idLanguage ? '(id = ?) DESC,' : ''
  if (idLanguage) params.push(lexiconId(query))
  const rows = d
    .prepare(
      `SELECT id, language, lemma, translit, gloss, definition FROM lexicon_headwords ${where}
       ORDER BY ${exactFirst} language, CAST(substr(id, 2) AS INTEGER) LIMIT ? OFFSET ?`
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
  // Swete supplies the Greek text, but the tags in its original_tokens rows are inferred
  // from other editions. They cannot identify occurrences in Swete's own concordance.
  const original = requested === 'MT' || greekNtEditions.has(requested)
  const tagged = !original && hasRealTagging(requested)
  const inferred = !original && hasTable('derived_tags') &&
    !!d.prepare('SELECT 1 FROM derived_tags WHERE translation_id = ? LIMIT 1').get(requested)
  // The lexicon labels its KJV fallback for translations without word tagging.
  const translation = original || inferred || tagged ? requested : 'KJV'
  const books = scopedBooks(opts)
  const result: ConcordanceResponse = { translation, derived: inferred && !tagged, total: 0, hits: [] }
  if (books?.length === 0) return result

  const includeNative = original || tagged || !inferred
  const source = original ? 'original_tokens' : 'verse_tokens'
  const editionColumn = original ? 'edition' : 'translation_id'
  const scope = books ? ` AND t.book_id IN (${books.map(() => '?').join(',')})` : ''
  const queries: string[] = []
  const params: string[] = []
  if (includeNative) {
    queries.push(`SELECT DISTINCT t.${editionColumn} AS edition, t.book_id, t.chapter, t.verse, 0 AS inferred
      FROM ${source} t WHERE t.${editionColumn}=? AND t.strongs=?${scope}`)
    params.push(translation, sid, ...(books ?? []))
  }
  if (inferred) {
    queries.push(`SELECT t.translation_id AS edition, t.book_id, t.chapter, t.verse, 1 AS inferred FROM derived_tags t
      WHERE t.translation_id=? AND ' ' || t.strongs || ' ' LIKE ?${scope}
      ${tagged ? 'AND NOT EXISTS (SELECT 1 FROM verse_tokens v WHERE v.translation_id=t.translation_id AND v.book_id=t.book_id AND v.chapter=t.chapter AND v.verse=t.verse)' : ''}`)
    params.push(translation, `% ${sid} %`, ...(books ?? []))
  }
  const refs = queries.join(' UNION ALL ')
  result.total = Number(d.prepare(`SELECT COUNT(*) AS n FROM (${refs})`).get(...params)?.n)
  const orderStatus = greekNtEditions.has(translation) ? greekOrderStatusSql(d, 'r') : 'NULL'
  const page = d.prepare(`SELECT r.*, b.name, ${orderStatus} AS orderStatus FROM (${refs}) r JOIN books b ON b.id=r.book_id
    ORDER BY b.sort_order, r.chapter, r.verse LIMIT ? OFFSET ?`)
    .all(...params, Math.max(0, Math.min(opts.limit ?? 300, 1000)), Math.max(0, opts.offset ?? 0))
  if (!page.length) return result
  // Rehydrate only the requested page, in one round trip. The ordinal keeps repeated IDs in
  // different verses apart without relying on a translation's own verse numbering or text.
  const pageJson = JSON.stringify(page.map(ref => [ref.book_id, ref.chapter, ref.verse, ref.inferred]))
  const selected = (packed: boolean) => `FROM json_each(?) selection CROSS JOIN ${packed ? 'derived_tags' : source} t ON t.${editionColumn}=?
    AND json_extract(selection.value,'$[3]')=${packed ? 1 : 0}
    AND t.book_id=json_extract(selection.value,'$[0]') AND t.chapter=json_extract(selection.value,'$[1]')
    AND t.verse=json_extract(selection.value,'$[2]')`
  type Token = { surface: string; trailer?: string; strongs: string | null; derived?: boolean | number }
  const grouped = new Map<number, Token[]>()
  if (inferred) {
    const rows = d.prepare(`SELECT selection.key ord, v.text, t.strongs ${selected(true)}
      JOIN verses v USING(translation_id,book_id,chapter,verse) ORDER BY selection.key`).all(pageJson, translation)
    for (const row of rows) grouped.set(Number(row.ord), decodeDerivedTokens(String(row.text), String(row.strongs)))
  }
  if (includeNative) {
    const tagEvidence = !original && hasEditionPacks
    const fields = original ? 't.original AS surface, t.strongs' : 't.surface, t.trailer, t.strongs'
    const rows = d.prepare(`SELECT selection.key ord, ${fields} ${tagEvidence ? ", e.kind = 'inferred' AS derived" : ''} ${selected(false)}
      ${tagEvidence ? 'LEFT JOIN edition_token_evidence e USING(translation_id,book_id,chapter,verse,position)' : ''}
      ORDER BY selection.key, t.position`).all(pageJson, translation) as (Token & { ord: number })[]
    for (const token of rows) {
      // TAHOT uses a backslash to introduce punctuation. Preserve the punctuation in the snippet.
      if (translation === 'MT') token.surface = token.surface.replace(/\\/g, '')
      const tokens = grouped.get(token.ord)
      if (tokens) tokens.push(token)
      else grouped.set(token.ord, [token])
    }
  }
  for (let i = 0; i < page.length; i++) {
    const ref = page[i]
    const tokens = grouped.get(i)
    if (!tokens) continue
    const snippet = tokens.map((t, i) =>
      (t.strongs === sid ? `{{${t.surface}}}` : t.surface) + (t.trailer ?? (i + 1 < tokens.length ? ' ' : ''))
    ).join('')
    const matches = tokens.filter(t => t.strongs === sid)
    const inferredCount = matches.filter(t => t.derived).length
    result.hits.push({ ...(inferredCount ? {tagEvidence: inferredCount === matches.length ? 'inferred' : 'mixed'} as const : {}),
      book: String(ref.book_id), bookName: String(ref.name),
      chapter: Number(ref.chapter), verse: Number(ref.verse), snippet,
      ...(ref.orderStatus === 'unverified' || ref.orderStatus === 'unknown' ? { orderStatus: ref.orderStatus } : {}),
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

/** Retain inflection, accents, vowel points and lexical identity. NFC equates Greek oxia/tonos. */
function interlinearForm(form: string | null, hebrew: boolean): string | null {
  if (!form) return null
  const word = form.normalize('NFC').replace(/[.,;:!?··;]+$/u, '')
  return publisherForm(word, hebrew ? 'Hebrew' : 'Greek')
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
  const masoretic = edition === 'MT'
  const swete = edition === 'LXX'
  const pair = masoretic && hasKetivPairs

  const rows = d
    .prepare(
      `SELECT t.verse, t.position, t.original, t.translit,
         ${swete ? 'NULL AS strongs, NULL AS morph, NULL AS gloss' : 't.strongs, t.morph, t.gloss'},
         ${masoretic && hasMasoreticSourceTypes ? 't.source_type' : 'NULL'} AS source_type,
         ${pair ? 'k.qere, k.ketiv' : 'NULL AS qere, NULL AS ketiv'}
       FROM original_tokens t ${pair ? `LEFT JOIN ketiv_qere k ON k.book_id=t.book_id AND k.chapter=t.chapter
         AND k.verse=t.verse AND k.position=t.position` : ''}
       WHERE t.edition=? AND t.book_id=? AND t.chapter=? ORDER BY t.verse, t.position`
    )
    .all(edition, book, chapter) as Record<string, unknown>[]

  const byVerse = new Map<number, InterlinearContent['verses'][number]['tokens']>()
  for (const r of rows) {
    const v = r.verse as number
    if (!byVerse.has(v)) byVerse.set(v, [])
    // TAHOT inserts a backslash to separate punctuation. The Hebrew punctuation itself is retained.
    const original = masoretic ? String(r.original).replace(/\\/g, '') : r.original as string
    const paired = typeof r.ketiv === 'string' && r.qere === original
    const sourceType = typeof r.source_type === 'string' ? r.source_type : paired ? 'Q' : undefined
    byVerse.get(v)!.push({
      position: r.position as number,
      ...(sourceType ? { sourceType } : {}),
      ...(paired ? { ketiv: r.ketiv as string } : {}),
      surface: (r.gloss as string) ?? '', // English gloss under the word
      trailer: ' ',
      strongs: (r.strongs as string) ?? null,
      lemma: original, // the Greek/Hebrew word (shown prominently)
      translit: (r.translit as string) ?? null,
      morph: (r.morph as string) ?? null,
      gloss: (r.gloss as string) ?? null
    })
  }

  // Swete supplies Greek forms. The database's LXX tags, glosses and parses were inferred
  // from other texts, and cannot establish a translation or a lexical ID for this occurrence.
  const sourceIssues = new Map<number, string>()
  if (swete) for (const [verse, tokens] of byVerse) {
    const issue = sweteReadingIssue({ book, chapter, verse }, tokens.map(t => t.lemma).join(' '))
    if (issue) {
      sourceIssues.set(verse, issue)
      byVerse.set(verse, [])
    }
  }

  // A form repeated in the original cannot be disambiguated by its English order.
  const uniqueWords = new Map<number, Map<string, VerseToken | null>>()
  const rowQuery = hasInterlinearRows && translations.length
    ? d.prepare('SELECT verse, source_row FROM interlinear_source_rows WHERE book_id=? AND chapter=?') : null
  const chapterRows = new Map<string, Set<string>>()
  if (rowQuery || hasEditionPacks) for (const [verse, tokens] of byVerse) {
    const forms = new Map<string, VerseToken | null>()
    for (const t of tokens) {
      const form = interlinearForm(t.lemma, masoretic)
      if (form) forms.set(form, forms.has(form) ? null : t)
      else for (const part of t.lemma?.split(/\s+/u) ?? []) {
        const component = interlinearForm(part, masoretic)
        if (component) forms.set(component, null)
      }
    }
    uniqueWords.set(verse, forms)
  }

  // Compare the corresponding native verses. A single LXX chapter can span two English chapters.
  const linesByVerse = new Map<number, NonNullable<InterlinearContent['verses'][number]['lines']>>()
  for (const tid of translations) {
    if (tid === edition && swete) continue
    const chapters = new Map<string, Map<number, Verse>>()
    for (const [verse, tokens] of byVerse) {
      if (sourceIssues.has(verse)) continue
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
      if (tid === 'LXX' && sweteReadingIssue(target, text.text)) continue
      let aligned = 0
      let covered = 0
      const originals = uniqueWords.get(verse)
      if (originals) {
        let reviewed = chapterRows.get(key)
        if (!hasEditionPacks && rowQuery && !reviewed) {
          reviewed = new Set(rowQuery.all(target.book, target.chapter).map(r => r.verse + '/' + r.source_row))
          chapterRows.set(key, reviewed)
        }
        for (const t of text.tokens ?? []) {
          const span = t.sourceWord
          if (!span) continue
          const form = interlinearForm(span.text, masoretic)
          if (!form) continue
          const ref = span.sourceRef
          const direct = span.edition === edition && ref?.book === book && ref.chapter === chapter && ref.verse === verse
          const reviewedBerean = span.edition === 'BSB' &&
            (hasEditionPacks ? span.uniqueForm : reviewed?.has(target.verse + '/' + span.rowId))
          const tok = direct && ref?.position !== undefined ? tokens.find(t => t.position === ref.position)
            : reviewedBerean ? originals.get(form) : undefined
          if (!tok || tok.strongs !== span.strongs || interlinearForm(tok.lemma, masoretic) !== form || tok.aligned?.[tid]) continue
          tok.aligned = { ...tok.aligned, [tid]: span.english }
          aligned++
          covered += span.endPosition - span.startPosition + 1
        }
      }
      if (!aligned || aligned < tokens.length || covered < (text.tokens?.length ?? 0)) {
        const lines = linesByVerse.get(verse) ?? []
        const ref = target.chapter !== chapter || target.verse !== verse ? `${target.chapter}:${target.verse}` : undefined
        lines.push({ id: tid, text: text.text, ref })
        linesByVerse.set(verse, lines)
      }
    }
  }

  // "All parses": attach every Scripture-attested analysis of each word's form (scholar-tagged).
  if (includeParses && !swete) {
    const norm = lang === 'hebrew' ? normHebrewWord : normGreekWord
    type Parse = NonNullable<VerseToken['parses']>[number]
    const tokens = Array.from(byVerse.values()).flat()
    const forms = [...new Set(tokens.map(t => norm(t.lemma ?? '')).filter(Boolean))]
    const parsed = d.prepare(`SELECT form, strongs, morph, gloss, count FROM form_parses
      WHERE lang=? AND form IN (SELECT value FROM json_each(?)) ORDER BY form, count DESC`)
      .all(lang, JSON.stringify(forms)) as unknown as (Parse & { form: string })[]
    const byForm = new Map<string, Parse[]>()
    for (const { form, ...parse } of parsed) {
      const list = byForm.get(form)
      if (list) list.push(parse)
      else byForm.set(form, [parse])
    }
    for (const token of tokens) {
      const parses = byForm.get(norm(token.lemma ?? ''))
      if (parses) token.parses = parses
    }
  }

  const verses = [...byVerse.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([verse, tokens]) => ({ verse, tokens, lines: linesByVerse.get(verse), sourceIssue: sourceIssues.get(verse) }))

  const uncertainOrder = hasGreekOrderReview && greekNtEditions.has(edition)
    ? d.prepare('SELECT verse FROM greek_order_uncertainties WHERE edition=? AND book_id=? AND chapter=? ORDER BY verse')
      .all(edition, book, chapter).map(row => Number(row.verse))
    : undefined
  return { book, chapter, edition, direction, verses, ...(uncertainOrder ? { uncertainOrderVerses: uncertainOrder } : {}),
    ...(masoretic ? { masoreticAttestationAvailable: hasMasoreticSourceTypes } : {}) }
}

export function getChapterApparatus(book: string, chapter: number): VerseVariant[] {
  return readChapterApparatus(required(), book, chapter)
}

export function getOriginalVerseReadings(ref: VerseRef) {
  return readOriginalVerse(required(), ref)
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
