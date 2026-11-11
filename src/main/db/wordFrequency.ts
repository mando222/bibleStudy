import type { DatabaseSync } from 'node:sqlite'
import { BOOKS } from '../../shared/books'
import { WORD_FREQUENCY_PUNCTUATION, WORD_FREQUENCY_VERSION } from '../../shared/wordFrequency'
import type {
  WordFrequency, WordFrequencyBook, WordFrequencyEdition, WordFrequencyForm,
  WordFrequencyPassageQuery, WordFrequencyQuery, WordFrequencyVerse
} from '../../shared/wordFrequency'
import { bibleDb } from './bible'

const supported = new Set<WordFrequencyEdition>(['MT', 'NA', 'TR', 'BYZ'])
const indexReady = new WeakMap<DatabaseSync, boolean>()

function available(db: DatabaseSync | null): db is DatabaseSync {
  if (!db) return false
  if (!indexReady.has(db)) {
    const tables = db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN
      ('meta','word_frequency_chapters','word_frequency_occurrences','word_frequency_gaps')`).get()
    const ready = tables?.n === 4 && db.prepare("SELECT value FROM meta WHERE key='word_frequency_version'").get()?.value === WORD_FREQUENCY_VERSION
    indexReady.set(db, ready)
  }
  return indexReady.get(db) === true
}

function supportedEntry(query: WordFrequencyQuery, id: string): boolean {
  return /^[GH][1-9]\d{0,4}$/.test(id) && supported.has(query.edition) &&
    (id.startsWith('H') === (query.edition === 'MT'))
}

function formKey(form: string, morph: string): string {
  return JSON.stringify([form, morph])
}

function selectedForm(key?: string | null): [string, string] | null {
  if (!key || typeof key !== 'string' || key.length > 2048) return null
  try {
    const pair: unknown = JSON.parse(key)
    return Array.isArray(pair) && pair.length === 2 && pair.every(v => typeof v === 'string')
      ? [pair[0], pair[1]] : null
  } catch { return null }
}

const filterForm = ' AND form=? AND morph=?'

export function getWordFrequency(query: WordFrequencyQuery, db = bibleDb()): WordFrequency {
  const id = String(query.id ?? '').trim().toUpperCase()
  const edition = query.edition
  const result: WordFrequency = {
    id, edition, language: edition === 'MT' ? 'Hebrew / Aramaic' : 'Greek',
    coverage: 'unavailable', notice: null, occurrences: 0, alternateOccurrences: 0, verses: 0, tagged: 0, forms: [], books: []
  }
  if (!available(db)) {
    result.notice = 'The installed Bible database does not include this version of the original-language frequency index.'
    return result
  }
  const entryExists = db.prepare(`SELECT 1 WHERE EXISTS (SELECT 1 FROM strongs_lexicon WHERE id=?)
    OR EXISTS (SELECT 1 FROM lexicon_entries WHERE strongs=?)`)
  if (!supportedEntry(query, id) || !entryExists.get(id, id)) {
    result.notice = 'This entry has no supported frequency index in the selected edition.'
    return result
  }
  if (WORD_FREQUENCY_PUNCTUATION.test(id)) {
    result.notice = 'STEPBible catalogs this entry as Hebrew punctuation or a section mark. The word-frequency index counts lexical words and their parts.'
    return result
  }

  // The full form menu is independent of the selected filter. Preserve separate parses even
  // when two grammatical forms have the same spelling. Show one attested transliteration.
  const rows = db.prepare(`SELECT form,morph,min(translit) AS translit,count(*) AS n,sum(alternate) AS alternates,
      min(language) AS firstLanguage,max(language) AS lastLanguage
    FROM word_frequency_occurrences WHERE strongs=? AND edition=?
    GROUP BY form,morph ORDER BY n DESC,form,morph`).all(id, edition)
  result.forms = rows.map((r): WordFrequencyForm => ({
    id: formKey(String(r.form), String(r.morph)), text: String(r.form), morph: String(r.morph),
    translit: r.translit == null ? null : String(r.translit), count: Number(r.n)
  }))
  const pair = selectedForm(query.form)
  if (query.form != null && (!pair || !result.forms.some(form => form.id === query.form))) {
    result.notice = 'This form is not recorded for the entry in this edition.'
    return result
  }

  const selectedRows = pair ? rows.filter(r => r.form === pair[0] && r.morph === pair[1]) : rows
  result.alternateOccurrences = selectedRows.reduce((n,r) => n + Number(r.alternates), 0)
  const languages = new Set(selectedRows.flatMap(r => [String(r.firstLanguage), String(r.lastLanguage)]))
  let language = ''
  if (languages.size === 1) {
    language = [...languages][0]
    result.language = language.charAt(0).toUpperCase() + language.slice(1)
  }

  // Include every native chapter (e.g. four chapters in MT Joel). A zero denominator
  // records a chapter with no tagged words in the relevant language.
  const chapterRows = db.prepare(`SELECT book_id,chapter,
      sum(CASE WHEN ?='' OR language=? THEN tagged_words ELSE 0 END) AS tagged
    FROM word_frequency_chapters WHERE edition=? GROUP BY book_id,chapter ORDER BY book_id,chapter`).all(language, language, edition)
  if (!chapterRows.length) {
    result.notice = 'The installed index has no chapter coverage for this edition.'
    return result
  }

  const totals = db.prepare(`SELECT book_id,native_chapter,count(*) AS n,count(DISTINCT native_verse) AS verses
    FROM word_frequency_occurrences WHERE strongs=? AND edition=?${pair ? filterForm : ''}
    GROUP BY book_id,native_chapter`).all(id, edition, ...(pair ?? []))
  const counts = new Map(totals.map(r => [`${r.book_id}/${r.native_chapter}`, r]))
  const byBook = new Map<string, WordFrequencyBook>()
  for (const book of BOOKS) {
    if (book.testament === (edition === 'MT' ? 'OT' : 'NT')) {
      byBook.set(book.id, { book: book.id, name: book.name, occurrences: 0, verses: 0, tagged: 0, chapters: [] })
    }
  }
  for (const r of chapterRows) {
    const book = byBook.get(String(r.book_id))
    if (!book) continue
    const c = counts.get(`${r.book_id}/${r.chapter}`)
    const chapter = { chapter: Number(r.chapter), occurrences: Number(c?.n ?? 0), verses: Number(c?.verses ?? 0), tagged: Number(r.tagged) }
    book.chapters.push(chapter)
    book.occurrences += chapter.occurrences
    book.verses += chapter.verses
    book.tagged += chapter.tagged
  }
  result.books = [...byBook.values()]
  for (const book of result.books) {
    result.occurrences += book.occurrences
    result.verses += book.verses
    result.tagged += book.tagged
  }
  const gaps = db.prepare('SELECT reason,positions FROM word_frequency_gaps WHERE edition=? AND strongs=? ORDER BY reason').all(edition, id)
  result.coverage = 'complete'
  if (gaps.length) {
    result.coverage = 'partial'
    const descriptions: Record<string, string> = {
      compound: 'multiword readings', 'ambiguous-alternate': 'alternate readings', 'unresolved-span': 'joined words'
    }
    const reasons = gaps.map(r => `${descriptions[String(r.reason)] ?? 'source tags'} (${r.positions})`)
    result.notice = `Some source positions have uncertain links to this entry in ${reasons.join(' and ')}. Counts include the confirmed uses.`
  } else if (!rows.length) {
    const other = db.prepare('SELECT DISTINCT edition FROM word_frequency_occurrences WHERE strongs=? ORDER BY edition').all(id)
    if (other.length) {
      result.notice = `No recorded uses in ${edition}. The entry is attested in ${other.map(r => r.edition).join(' and ')}.`
    } else {
      result.coverage = 'partial'
      result.notice = 'No source-tagged uses are linked to this dictionary entry in the supported editions. Its absence from Scripture cannot be established from these tags.'
    }
  }
  return result
}

interface Span { position: number; start: number; end: number }

export function getWordFrequencyPassages(query: WordFrequencyPassageQuery, db = bibleDb()): WordFrequencyVerse[] {
  const id = String(query.id ?? '').trim().toUpperCase()
  const pair = selectedForm(query.form)
  if (!available(db) || !supportedEntry(query, id) || WORD_FREQUENCY_PUNCTUATION.test(id) || !Number.isSafeInteger(query.chapter) ||
    query.chapter < 1 || typeof query.book !== 'string' || (query.form != null && !pair)) return []
  const hits = db.prepare(`SELECT chapter,verse,native_verse,position,surface_start,surface_end,segments
    FROM word_frequency_occurrences WHERE strongs=? AND edition=? AND book_id=? AND native_chapter=?
    ${pair ? filterForm : ''} ORDER BY native_verse,chapter,verse,position,part`).all(id, query.edition, query.book, query.chapter, ...(pair ?? []))
  if (!hits.length) return []

  const passages = new Map<number, WordFrequencyVerse>()
  const spans = new Map<string, Span[]>()
  for (const hit of hits) {
    const verse = Number(hit.native_verse)
    let passage = passages.get(verse)
    if (!passage) {
      passage = {
        book: query.book, chapter: query.chapter, verse, occurrences: 0, tokens: [],
        readerRef: { book: query.book, chapter: Number(hit.chapter), verse: Number(hit.verse) }
      }
      passages.set(verse, passage)
    }
    passage.occurrences++
    const parts: Span[] = hit.segments ? JSON.parse(String(hit.segments)) : [
      { position: Number(hit.position), start: Number(hit.surface_start), end: Number(hit.surface_end) }
    ]
    for (const span of parts) {
      const key = `${hit.chapter}/${hit.verse}/${span.position}`
      const group = spans.get(key) ?? []
      group.push(span)
      spans.set(key, group)
    }
  }

  // Read all tokens of the matching native verses, including words without lexical tags.
  // Filtering on the native reference also handles a verse split across two reader verses.
  const numbers = [...passages.keys()]
  const words = db.prepare(`SELECT native_verse,chapter,verse,position,original FROM original_tokens
    WHERE edition=? AND book_id=? AND native_chapter=? AND native_verse IN (${numbers.map(() => '?').join(',')})
      AND (source_type IS NULL OR source_type NOT IN ('X','R'))
    ORDER BY native_verse,chapter,verse,position`).all(query.edition, query.book, query.chapter, ...numbers)
  for (const row of words) {
    const passage = passages.get(Number(row.native_verse))!
    const original = String(row.original)
    const parts = spans.get(`${row.chapter}/${row.verse}/${row.position}`) ?? []
    let next = 0
    const previous = passage.tokens.at(-1)
    let spaceBefore = !!previous && !(query.edition === 'MT' && previous.text.endsWith('־'))
    const append = (slice: string, matching: boolean) => {
      // TAHOT marks punctuation joins with a backslash. It is a source delimiter.
      const text = query.edition === 'MT' ? slice.replace(/\\/g, '') : slice
      if (!text) return
      passage.tokens.push({ text, matching, spaceBefore })
      spaceBefore = false
    }
    for (const span of parts.sort((a, b) => a.start - b.start)) {
      append(original.slice(next, span.start), false)
      append(original.slice(span.start, span.end), true)
      next = span.end
    }
    append(original.slice(next), false)
  }
  return [...passages.values()]
}
