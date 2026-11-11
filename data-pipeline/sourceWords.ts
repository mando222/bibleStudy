import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { BOOKS } from '../src/shared/books'
import { mapPassage } from '../src/shared/passageMapping'
import { SOURCE_WORD_ALIGNMENT_VERSION } from '../src/shared/sourceWords'
import { normSurface } from '../src/shared/verseUnits'
import type { SourceWord } from '../src/shared/types'
import { countSourceSpans } from '../src/main/db/sourceWordCoverage'

type Language = SourceWord['language']
type StoredToken = { position: number; surface: string; trailer: string; strongs: string | null; lemma: string | null; translit: string | null; morph: string | null }
type SourceRow = { keys: string[]; english: string; printed: string; language: Language; id: string; strongs: string; text: string; translit: string; morph: string; eligible: boolean }
type WitnessToken = { original: string; strongs: string | null; morph: string | null; source_type: string | null }
type Ref = { book: string; chapter: number; verse: number }

const englishWords = (text: string): string[] => text.split(/\s+/).map(normSurface).filter(Boolean)
// Keep internal punctuation and possessives when checking the actual occurrence. The looser
// word keys above only locate a candidate after the publisher rows have been re-tiled.
const englishSpan = (text: string): string => text.trim().toLowerCase().replace(/^[“"(]+|[”)".,;:!?…]+$/gu, '')
const divineId = (id: string | null): boolean => id === 'H3068' || id === 'H3069'
const hebrewLetters = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '')
const bareName = (text: string): boolean => /^יהוה(?:[־׀׃]|\\[־׀׃])*$/u.test(hebrewLetters(text))
const englishName = /^(?:(?:the|The) )?(LORD|GOD|Jehovah|YHWH)$/u

/** Ignore editorial separators only. Preserve vowel points, accents, breathings and affixes. */
function witnessForm(text: string, language: Language): string {
  const normalized = text.normalize('NFC')
  if (language === 'Greek') return normalized.replace(/[.,;·:!?]+$/u, '')
  // TAHOT escapes punctuation with backslashes. A section marker may follow sof pasuq.
  return normalized.replace(/\\?׃(?:\\?\s*\\?[פס])?$/u, '').replace(/(?:\\?[־׀])+$/u, '')
}

function corroborated(row: SourceRow, witnesses: WitnessToken[]): boolean {
  const form = witnessForm(row.text, row.language)
  const possible = witnesses.filter(t => t.strongs === row.strongs ||
    witnessForm(t.original, row.language).split(/\s+/u).some(word => witnessForm(word, row.language) === form))
  if (possible.length !== 1) return false
  const [w] = possible
  if (w.strongs !== row.strongs || witnessForm(w.original, row.language) !== form) return false
  // TAHOT's L readings are present in the Leningrad manuscript. Q, R and X are read forms,
  // supplied parallels or reconstructions. They cannot establish the written word here.
  return row.language === 'Greek' || (w.source_type?.startsWith('L') === true &&
    w.morph?.startsWith(row.language === 'Hebrew' ? 'H' : 'A') === true)
}

function onlyOccurrence(words: string[], phrase: string[]): number {
  let occurrence = -1
  for (let i = 0; i <= words.length - phrase.length; i++) {
    if (!phrase.every((word, j) => word === words[i + j])) continue
    if (occurrence !== -1) return -1
    occurrence = i
  }
  return occurrence
}

/** A folded or untranslated source word can supply part of a different English token,
 * even when that token is a single word (e.g. "cannot"). Require a complete row-for-row
 * match of this verse before certifying any standalone substitution in it. */
function completeAlignment(rows: SourceRow[], printed: StoredToken[]): boolean {
  return rows.length === printed.length && new Set(rows.map(r => r.id)).size === rows.length &&
    rows.every((row, i) => {
      const token = printed[i]
      return row.eligible && row.printed !== 'vvv' && /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(row.printed) &&
        token.position === i && row.printed === token.surface && row.text === token.lemma &&
        row.strongs === token.strongs && row.translit === token.translit && !!row.morph &&
        row.morph === token.morph && !/[\p{L}\p{N}]/u.test(token.trailer)
    })
}

/** The original-language form, transliteration and English phrase must all come from ONE
 * publisher row. Reconciliation can split phrases or align only a fragment; abstain on either.
 * An intact row must match at its position, or be unique in both the source and printed verse. */
export function buildSourceWordSpans(db: DatabaseSync, path: string): void {
  const bookIds = new Map(BOOKS.map(b => [b.name, b.id]))
  const greekBooks = new Set(BOOKS.filter(b => b.testament === 'NT').map(b => b.id))
  bookIds.set('Psalm', 'Ps')
  const tokens = db.prepare(`SELECT position, surface, trailer, strongs, lemma, translit, morph FROM verse_tokens
    WHERE translation_id=? AND book_id=? AND chapter=? AND verse=? ORDER BY position`)
  const insert = db.prepare(`INSERT INTO source_word_spans VALUES(?,?,?,?,?,?,?,?,?)`)
  const singleton = db.prepare('INSERT INTO source_word_singletons VALUES(?,?,?,?,?,?)')
  const witnessVerse = db.prepare(`SELECT original, strongs, morph, source_type FROM original_tokens
    WHERE edition=? AND book_id=? AND chapter=? AND verse=?`)

  function record(ref: Ref, rows: SourceRow[]): void {
    const loc = [ref.book, ref.chapter, ref.verse]
    const bsb = tokens.all('BSB', ...loc) as StoredToken[]
    if (!bsb.length) return
    const complete = completeAlignment(rows, bsb)
    const sourceKeys = rows.flatMap(row => row.keys)
    const printedKeys = bsb.flatMap(t => englishWords(t.surface))
    const sameOrder = sourceKeys.length === printedKeys.length && sourceKeys.every((w, i) => w === printedKeys[i])

    // Point directly into the displayed BSB tokens, never into a Strong's-number bucket.
    const byWord = new Map<number, {token: StoredToken; offset: number}>()
    let word = 0
    let offset = 0
    for (const token of bsb) {
      byWord.set(word, { token, offset })
      word += englishWords(token.surface).length
      offset += token.surface.length + token.trailer.length
    }

    const canonical = mapPassage(ref, 'BSB', 'KJV')
    const kjv = canonical?.chapter === ref.chapter && canonical?.verse === ref.verse
      ? tokens.all('KJV', ...loc) as StoredToken[] : []
    const verseText = (ts: StoredToken[]) => ts.map(t => t.surface + t.trailer).join('')
    const sameEnglish = kjv.length > 0 && verseText(kjv) === verseText(bsb)
    const edition = greekBooks.has(ref.book) ? 'TR' : 'MT'
    let witness: WitnessToken[] | undefined
    function witnesses(): WitnessToken[] {
      return witness ??= witnessVerse.all(edition, ...loc) as WitnessToken[]
    }
    const starts = new Map<number, number>()
    const ends = new Map<number, number>()
    let char = 0
    if (sameEnglish) {
      for (const token of kjv) {
        starts.set(char, token.position)
        ends.set(char + token.surface.length, token.position)
        char += token.surface.length + token.trailer.length
      }
    }

    let start = 0
    for (const row of rows) {
      const sourceStart = start
      start += row.keys.length
      if (!row.eligible || !row.keys.length) continue
      if (!sameOrder && onlyOccurrence(sourceKeys, row.keys) !== sourceStart) continue
      const here = byWord.get(sameOrder ? sourceStart : onlyOccurrence(printedKeys, row.keys))
      if (!here) continue
      const { token } = here
      const targetKeys = englishWords(token.surface)
      if (token.strongs !== row.strongs || token.lemma !== row.text || token.translit !== row.translit ||
          englishSpan(token.surface) !== row.english ||
          targetKeys.length !== row.keys.length || !targetKeys.every((w, i) => w === row.keys[i])) continue
      insert.run('BSB', ...loc, token.position, token.position, token.position, row.id, row.language)
      const canStandAlone = complete && row.keys.length === 1 && !row.morph.includes('|') &&
        !/^['’]/u.test(token.trailer)
      if (canStandAlone) singleton.run('BSB', ...loc, token.position, row.id)
      if ((row.language === 'Greek') !== (edition === 'TR')) continue
      if (divineId(row.strongs)) {
        // Unlike general vocabulary, the four-letter personal name has a separately verifiable
        // literal form. Confirm the one occurrence in all three witnesses, even in a differently
        // worded KJV verse. A prefix, a possessive, a second spelling or an uncertain tag abstains.
        if (row.language !== 'Hebrew' || !bareName(row.text) || !englishName.test(token.surface) ||
            rows.filter(r => divineId(r.strongs) || hebrewLetters(r.text).includes('יהוה')).length !== 1) continue
        const named = kjv.filter(t => divineId(t.strongs) || /\b(?:LORD|GOD|Jehovah|YHWH)\b/u.test(t.surface))
        if (named.length !== 1 || named[0].strongs !== row.strongs || !englishName.test(named[0].surface) ||
            /^(?:['’]s|['’](?=\s|$))/iu.test(named[0].trailer)) continue
        const hebrew = witnesses().filter(t =>
          divineId(t.strongs) || hebrewLetters(t.original).includes('יהוה'))
        if (hebrew.length !== 1 || hebrew[0].strongs !== row.strongs || !hebrew[0].source_type?.startsWith('L') ||
            !bareName(hebrew[0].original)) continue
        const last = named[0].position
        const before = kjv[last - 1]
        const first = before && !before.strongs && /^(?:the|The)$/.test(before.surface) && before.trailer === ' ' ? last - 1 : last
        const english = (first < last ? before.surface + before.trailer : '') + named[0].surface
        if (english.replace(/^The /, 'the ') !== token.surface.replace(/^The /, 'the ')) continue
        insert.run('KJV', ...loc, first, last, token.position, row.id, row.language)
        continue
      }
      if (!sameEnglish) continue

      // KJV has no source-row IDs. Require the same whole verse verbatim, the identical English
      // span, exactly one independent KJV tag, and the same unique inflected word in MT or TR.
      if (rows.filter(r => r.strongs === row.strongs).length !== 1 ||
          kjv.filter(t => t.strongs === row.strongs).length !== 1) continue
      const first = starts.get(here.offset)
      const last = ends.get(here.offset + token.surface.length)
      if (first == null || last == null || kjv[last].strongs !== row.strongs ||
          kjv.slice(first, last).some(t => t.strongs !== null) || !corroborated(row, witnesses())) continue
      insert.run('KJV', ...loc, first, last, token.position, row.id, row.language)
      if (canStandAlone && first === last) singleton.run('KJV', ...loc, last, row.id)
    }
  }

  db.exec('BEGIN')
  try {
    let ref: Ref | null = null
    let rows: SourceRow[] = []
    for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
      const c = line.split('\t')
      if (c.length < 19) continue
      if (c[12].trim()) {
        if (ref) record(ref, rows)
        rows = []
        const next = /^(.*) (\d+):(\d+)$/.exec(c[12].trim())
        const book = next && bookIds.get(next[1])
        ref = book && next ? { book, chapter: Number(next[2]), verse: Number(next[3]) } : null
      }
      if (!ref) continue
      const english = c[18].trim()
      const language = c[4] as Language
      const greek = language === 'Greek'
      const id = c[greek ? 1 : 0].trim()
      const num = c[greek ? 11 : 10].trim()
      const text = c[5].trim()
      const translit = c[7].trim()
      const keys = englishWords(english)
      // A word omitted in English is still relevant to the repeated-lemma check.
      if (!text && !english && !c[6].trim()) continue
      rows.push({ keys, english: englishSpan(english), printed: english, language, id,
        strongs: (greek ? 'G' : 'H') + num, text, translit, morph: c[9].trim(),
        eligible: ['Hebrew', 'Aramaic', 'Greek'].includes(language) && /^[1-9]\d*(?:\.\d+)?$/.test(id) &&
          /^\d+$/.test(num) && !!translit && text === c[6].trim() &&
          !/[\[\]{}]/.test(english) && /^[\p{L}\p{M}־׀׃’᾽']+$/u.test(text) })
    }
    if (ref) record(ref, rows)
    const coverage = db.prepare('INSERT INTO source_word_coverage VALUES(?,?,?)')
    for (const [id, editions] of countSourceSpans(db)) {
      for (const [edition, count] of editions) coverage.run(id, edition, count)
    }
    db.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('source_word_alignment_version',?)")
      .run(SOURCE_WORD_ALIGNMENT_VERSION)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
