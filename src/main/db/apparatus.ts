import type { DatabaseSync } from 'node:sqlite'
import { BOOK_BY_ID } from '../../shared/books'
import { mapPassage } from '../../shared/passageMapping'
import { sweteReadingIssue } from '../../shared/lxxIntegrity'
import { compareGreekReadings, type ApparatusWord, type GreekReadings, type MasoreticPair,
  type OriginalVerseReadings, type StudyRef, type SweteReading, type VerseVariant } from '../../shared/apparatus'
import type { NtText } from '../../shared/textPreference'
import type { VerseRef } from '../../shared/types'

// Older bundled databases have the same original words but lack native numbering or witness codes.
function originalColumns(db: DatabaseSync) {
  const fields = new Set(db.prepare('PRAGMA table_info(original_tokens)').all().map(column => column.name))
  return {
    native: ['native_chapter', 'native_verse'].map(name => fields.has(name) ? name : 'NULL AS ' + name).join(', '),
    sourceType: fields.has('source_type') ? 'source_type' : 'NULL AS source_type'
  }
}

function addNativeRef(refs: string[], chapter: number | null, verse: number | null) {
  if (chapter == null || verse == null) return
  const ref = chapter + ':' + verse
  if (!refs.includes(ref)) refs.push(ref)
}

function greekReadings(db: DatabaseSync, book: string, chapter: number, verse?: number): Map<number, GreekReadings> {
  const args = verse == null ? [book, chapter] : [book, chapter, verse]
  const hasOrderChecks = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='greek_order_uncertainties'").get())
  const uncertain = hasOrderChecks ? new Set(db.prepare(`SELECT edition, verse FROM greek_order_uncertainties
    WHERE book_id=? AND chapter=? ${verse == null ? '' : 'AND verse=?'}`).all(...args).map(row => row.edition + '/' + row.verse)) : null
  const rows = db.prepare(`SELECT edition, verse, ${originalColumns(db).native}, original AS surface, strongs, translit, gloss
    FROM original_tokens WHERE book_id=? AND chapter=? AND edition IN ('NA','TR','BYZ') ${verse == null ? '' : 'AND verse=?'}
    ORDER BY verse, edition, position`).all(...args) as unknown as (ApparatusWord & {
      edition: NtText; verse: number; native_chapter: number | null; native_verse: number | null
    })[]
  const verses = new Map<number, GreekReadings>()
  for (const { verse: number, edition, native_chapter, native_verse, ...word } of rows) {
    const readings = verses.get(number) ?? {}
    const reading = readings[edition] ?? { words: [], nativeRefs: [],
      orderStatus: uncertain == null ? 'unknown' : uncertain.has(edition + '/' + number) ? 'unverified' : undefined }
    reading.words.push(word)
    addNativeRef(reading.nativeRefs, native_chapter, native_verse)
    readings[edition] = reading
    verses.set(number, readings)
  }
  return verses
}

function masoreticPairs(db: DatabaseSync, book: string, chapter: number, verse?: number) {
  const args = verse == null ? [book, chapter] : [book, chapter, verse]
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ketiv_qere'").get()) return []
  return db.prepare(`SELECT verse, qere, ketiv, strongs AS qereStrongs FROM ketiv_qere
    WHERE book_id=? AND chapter=? ${verse == null ? '' : 'AND verse=?'} ORDER BY verse, position`)
    .all(...args) as unknown as (MasoreticPair & { verse: number })[]
}

export function readChapterApparatus(db: DatabaseSync, book: string, chapter: number): VerseVariant[] {
  if (BOOK_BY_ID[book]?.testament === 'OT') {
    if (!db.prepare("SELECT 1 FROM original_tokens WHERE edition='MT' AND book_id=? AND chapter=? LIMIT 1").get(book, chapter))
      throw new Error('The Masoretic text is unavailable for this chapter.')
    const grouped = new Map<number, MasoreticPair[]>()
    for (const { verse, ...pair } of masoreticPairs(db, book, chapter)) {
      const pairs = grouped.get(verse) ?? []
      pairs.push(pair)
      grouped.set(verse, pairs)
    }
    return [...grouped].map(([verse, pairs]) => ({ kind: 'masoretic', verse, pairs }))
  }
  const verses = greekReadings(db, book, chapter)
  if (!verses.size) throw new Error('Greek edition readings are unavailable for this chapter.')
  return [...verses].flatMap(([verse, readings]) => compareGreekReadings(verse, readings) ?? [])
}

function readSwete(db: DatabaseSync, ref: StudyRef): SweteReading {
  const text = db.prepare("SELECT text FROM verses WHERE translation_id='LXX' AND book_id=? AND chapter=? AND verse=?")
    .get(ref.book, ref.chapter, ref.verse)?.text
  if (typeof text !== 'string' || !text.trim()) return { ref, text: null }
  const issue = sweteReadingIssue(ref, text)
  return issue ? { ref, text: null, issue } : { ref, text }
}

export function readOriginalVerse(db: DatabaseSync, request: VerseRef): OriginalVerseReadings {
  if (!BOOK_BY_ID[request.book] || !Number.isSafeInteger(request.chapter) || !Number.isSafeInteger(request.verse) ||
      request.translation.startsWith('imp_') || !db.prepare(
        'SELECT 1 FROM translations WHERE id=? UNION ALL SELECT 1 FROM editions WHERE id=? LIMIT 1'
      ).get(request.translation, request.translation)) return { kind: 'unmapped' }
  const address = { book: request.book, chapter: request.chapter, verse: request.verse }
  const ref = mapPassage(address, request.translation, 'KJV')
  if (!ref && request.translation === 'LXX' && BOOK_BY_ID[address.book].testament === 'OT') {
    return { kind: 'ot', ref: address, nativeLxxOnly: true, mt: { words: [], nativeRefs: [], pairs: [] },
      lxx: readSwete(db, address) }
  }
  if (!ref) return { kind: 'unmapped' }
  const { book, chapter, verse } = ref
  if (BOOK_BY_ID[book].testament === 'NT') return { kind: 'greek', ref, readings: greekReadings(db, book, chapter, verse).get(verse) ?? {} }

  const columns = originalColumns(db)
  const mtRows = db.prepare(`SELECT original, ${columns.sourceType}, ${columns.native} FROM original_tokens
    WHERE edition='MT' AND book_id=? AND chapter=? AND verse=? ORDER BY position`).all(book, chapter, verse) as {
      original: string; source_type: string | null; native_chapter: number | null; native_verse: number | null
    }[]
  const nativeRefs: string[] = []
  const words = mtRows.map(row => {
    addNativeRef(nativeRefs, row.native_chapter, row.native_verse)
    // TAHOT marks internal joins with backslashes, also removed in the standalone MT reading edition.
    return { surface: row.original.replace(/\\/g, ''), sourceType: row.source_type }
  })
  const native = mapPassage(ref, 'KJV', 'LXX')
  return { kind: 'ot', ref, mt: { words, nativeRefs, pairs: masoreticPairs(db, book, chapter, verse) },
    lxx: native && readSwete(db, native) }
}
