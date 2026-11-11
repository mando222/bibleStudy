import { createReadStream, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { describe, expect, it, vi } from 'vitest'
import { getChapter } from '../src/main/db/bible'
import { BOOKS } from '../src/shared/books'
import { restoredVerseSegments, SOURCE_WORD_TERMS, type VerseSegment } from '../src/shared/sourceWords'
import type { ChapterRef, SourceWord, Verse } from '../src/shared/types'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

const publisherFile = 'data-pipeline/sources/bsb_tables.tsv'
const identifiers = SOURCE_WORD_TERMS.flatMap(term => term.ids)
const allTerms = Object.fromEntries(identifiers.map(id => [id, true]))
const noTerms = Object.fromEntries(identifiers.map(id => [id, false]))

function englishWords(text: string): string[] {
  return text.replace(/\bThe\b/g, 'the').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
}

interface PublisherRow {
  strongs: string
  form: string
  alternate: string
  translit: string
  morph: string
  english: string
  wordOffset: number
}

interface PublishedVerse {
  divineNames: number
  words: string[]
  rows: Map<string, PublisherRow>
}

// Read the publisher's table directly, independent of the SQLite aligner and its calculated spans.
// Keep the word offset in the untouched English row order so repeated words cannot trade forms.
async function readPublisher(): Promise<Map<string, PublishedVerse>> {
  const verses = new Map<string, PublishedVerse>()
  const lines = createInterface({ input: createReadStream(publisherFile), crlfDelay: Infinity })
  const wanted = new Set(identifiers)
  let current: PublishedVerse | undefined
  let header = true
  for await (const line of lines) {
    const c = line.split('\t')
    if (header) {
      expect([c[0], c[1], c[4], c[5], c[7], c[9], c[10], c[11], c[12], c[18]?.trim()])
        .toEqual(['Heb Sort', 'Greek Sort', 'Language', 'WLC / Nestle Base TR RP WH NE NA SBL',
          'Translit', 'Parsing', 'Str Heb', 'Str Grk', 'VerseId', 'BSB version'])
      header = false
      continue
    }
    if (c.length < 19) continue
    if (c[12].trim()) {
      current = { divineNames: 0, words: [], rows: new Map() }
      const address = c[12].trim()
      if (verses.has(address)) throw new Error('Duplicate publisher address ' + address)
      verses.set(address, current)
    }
    if (!current) continue
    const greek = c[4] === 'Greek'
    const strongs = (greek ? 'G' : 'H') + c[greek ? 11 : 10].trim()
    const english = c[18].trim()
    if (strongs === 'H3068' || strongs === 'H3069' ||
        (!greek && c[5].normalize('NFD').replace(/\p{M}/gu, '').includes('יהוה'))) current.divineNames++
    if (wanted.has(strongs)) {
      const key = c[4] + ':' + c[greek ? 1 : 0].trim()
      if (current.rows.has(key)) throw new Error('Duplicate publisher occurrence ' + key)
      current.rows.set(key, {
        strongs, english, form: c[5].trim(), alternate: c[6].trim(), translit: c[7].trim(),
        morph: c[9].trim(), wordOffset: current.words.length
      })
    }
    current.words.push(...englishWords(english))
  }
  return verses
}

function occurrences(words: string[], needle: string[]): number {
  return words.filter((_, i) => needle.every((word, j) => words[i + j] === word)).length
}

const families = SOURCE_WORD_TERMS.map(term => ({
  ...term, settings: { ...noTerms, ...Object.fromEntries(term.ids.map(id => [id, true])) }
}))
const hasPublisher = existsSync(publisherFile)

function verifyPublisherRow(
  source: SourceWord, span: VerseSegment, verse: Verse, offset: number, translation: string,
  published: PublishedVerse, detail: string
): void {
  const row = published.rows.get(source.language + ':' + source.rowId)
  // Some Berean glosses include a parenthesis which the Bible prints in the trailer.
  const printed = span.original.replace(/^The /, 'the ')
  const gloss = row?.english.replace(/^The /, 'the ')
  const sameEnglish = gloss === printed || (gloss === printed + ')' && span.token!.trailer.startsWith(')'))
  if (!row || row.strongs !== source.strongs || row.form !== row.alternate || !sameEnglish ||
      row.translit !== source.translit || !row.morph || row.morph.includes('|') || row.morph !== source.morph) {
    throw new Error('Publisher row disagrees with displayed occurrence in ' + detail)
  }
  const form = source.language === 'Greek' ? row.form :
    row.form.replace(/׃[פס]$/u, '').replace(/^[־׀׃]+|[־׀׃]+$/gu, '')
  if (form !== source.text) throw new Error('Wrong source form in ' + detail)
  const printedWords = englishWords(verse.text)
  if (printedWords.join(' ').toLowerCase() === published.words.join(' ').toLowerCase()) {
    if (englishWords(verse.text.slice(0, offset)).length !== row.wordOffset) {
      throw new Error('Restored another occurrence in ' + detail)
    }
  } else {
    const needle = englishWords(row.english)
    // KJV can name God once where a second English LORD is implicit in the BSB
    // (Leviticus 10:6). The source must contain exactly one written personal name.
    const countInPublisher = translation === 'KJV' && (source.strongs === 'H3068' || source.strongs === 'H3069') ?
      published.divineNames : occurrences(published.words, needle)
    if (occurrences(printedWords, needle) !== 1 || countInPublisher !== 1) {
      throw new Error('Ambiguous occurrence in ' + detail)
    }
  }
}

interface Coverage {
  ids: Set<string>
  yhwh: number
  other: number
}

function verifyVerse(
  ref: ChapterRef, verse: Verse, address: string, published: PublishedVerse | undefined, coverage: Coverage
): void {
  const location = ref.translation + ' ' + address
  const spans = restoredVerseSegments(verse, ref, true, allTerms)
  if (spans.map(s => s.original).join('') !== verse.text ||
      restoredVerseSegments(verse, ref, false, allTerms).map(s => s.display).join('') !== verse.text ||
      restoredVerseSegments(verse, ref, true, noTerms).map(s => s.display).join('') !== verse.text) {
    throw new Error('Published text changed in ' + location)
  }
  let printedOffset = 0
  const seenRows = new Set<string>()
  for (const span of spans) {
    const offset = printedOffset
    printedOffset += span.original.length
    if (span.display === span.original) continue
    const source = span.token?.sourceWord
    const id = span.token?.strongs
    if (!id || !allTerms[id] || span.token?.derived || !source || source.edition !== 'BSB' ||
        source.strongs !== id || source.book !== ref.book || source.chapter !== ref.chapter ||
        source.verse !== verse.verse || source.english !== span.original ||
        source.evidence !== (ref.translation === 'BSB' ? 'aligned' : 'corroborated')) {
      throw new Error('Unverified occurrence in ' + location + ': ' + span.original)
    }
    const key = source.language + ':' + source.rowId
    const detail = location + ' ' + key + ' (' + span.original + ')'
    const tokens = verse.tokens!
    const startOffset = tokens.slice(0, source.startPosition).map(t => t.surface + t.trailer).join('').length
    if (startOffset !== offset || tokens[source.endPosition] !== span.token ||
        (id.startsWith('G') ? source.language !== 'Greek' : !['Hebrew', 'Aramaic'].includes(source.language))) {
      throw new Error('Wrong source token or language in ' + detail)
    }
    if (seenRows.has(key)) throw new Error('Repeated source row in ' + detail)
    seenRows.add(key)
    if (published) verifyPublisherRow(source, span, verse, offset, ref.translation, published, detail)
    if (id === 'H3068' || id === 'H3069') {
      coverage.yhwh++
      if (span.display !== 'YHWH' || source.language !== 'Hebrew' ||
          source.text.normalize('NFD').replace(/\p{M}/gu, '') !== 'יהוה') {
        throw new Error('Incorrect divine name in ' + detail)
      }
    } else {
      coverage.other++
      if (span.display !== source.translit.normalize('NFC').replace(/·/g, '')) {
        throw new Error('Incorrect transliteration in ' + detail)
      }
    }
    if (!coverage.ids.has(id)) {
      const singleId = restoredVerseSegments(verse, ref, true, { ...noTerms, [id]: true })
      const expected = spans.map(s => s.token?.strongs === id ? s.display : s.original).join('')
      expect(singleId.map(s => s.display).join(''), 'Individual setting ' + id + ' in ' + detail).toBe(expected)
      coverage.ids.add(id)
    }
  }
  for (const term of families) {
    const expected = spans.map(span => term.ids.includes(span.token?.strongs ?? '') ?
      span.display : span.original).join('')
    const isolated = restoredVerseSegments(verse, ref, true, term.settings)
    if (isolated.map(s => s.display).join('') !== expected) {
      throw new Error('Setting ' + term.label + ' affected the wrong text in ' + location)
    }
    let offset = 0
    for (const span of isolated) {
      if (span.display !== span.original) {
        const source = span.token?.sourceWord
        if (!source || !term.ids.includes(source.strongs)) throw new Error('Wrong source for ' + term.label + ' in ' + location)
        if (published) verifyPublisherRow(source, span, verse, offset, ref.translation, published, location + ' ' + source.rowId)
      }
      offset += span.original.length
    }
  }
}

describe.skipIf(!existsSync('resources/bible.sqlite'))('source word restoration across both tagged Bibles', () => {
  it('preserves every verse and isolates each setting' +
      (hasPublisher ? ' against the publisher’s raw bilingual rows' : ' (publisher table unavailable)'), async () => {
    const publisher = hasPublisher ? await readPublisher() : undefined
    const restoredIds = new Set<string>()
    expect(new Set(identifiers).size).toBe(45)
    for (const [translation, size, yhwh, other] of [['BSB', 31086, 2941, 3432], ['KJV', 31102, 1916, 1]] as const) {
      let count = 0
      const coverage: Coverage = { ids: restoredIds, yhwh: 0, other: 0 }
      for (const book of BOOKS) {
        for (let chapter = 1; chapter <= book.chapters; chapter++) {
          const ref = { translation, book: book.id, chapter }
          for (const verse of getChapter(ref).verses) {
            const address = (book.id === 'Ps' ? 'Psalm' : book.name) + ' ' + chapter + ':' + verse.verse
            const published = publisher?.get(address)
            if (publisher && !published) throw new Error('Missing publisher verse at ' + address)
            verifyVerse(ref, verse, address, published, coverage)
            count++
          }
        }
      }
      expect(count, translation + ' verses audited').toBe(size)
      expect([coverage.yhwh, coverage.other], translation + ' verified inline occurrences').toEqual([yhwh, other])
    }
    // These two Hebrew IDs have English rows for ordinary adversaries and scoundrels.
    // Neither yields a standalone attested name with the current publisher data.
    const withoutPublishedName = new Set(['H1100', 'H7854'])
    expect([...restoredIds].sort()).toEqual(identifiers.filter(id => !withoutPublishedName.has(id)).sort())
  }, 180000)

  it.each([
    ['Exod', 15, 2, 'H3050', '45775', 'The LORD', 'yāh'],
    ['Gen', 17, 1, 'H7706', '9180', 'Almighty', 'šadday'],
    ['Gen', 14, 18, 'H5945', '8163', 'Most High', '‘elyōwn'],
    ['John', 3, 16, 'G25', '80599', 'loved', 'ēgapēsen'],
    ['Matt', 1, 21, 'G2424', '557', 'Jesus', 'Iēsoun'],
    ['Matt', 1, 23, 'G1694', '616', 'Immanuel', 'Emmanouēl'],
    ['Matt', 25, 1, 'G3566', '23700', 'bridegroom', 'nymphiou'],
    ['Matt', 12, 24, 'G954', '10143', 'Beelzebul', 'Beelzeboul'],
    ['Jas', 4, 4, 'G5373', '193817', 'friendship', 'philia']
  ] as const)('restores the published occurrence in %s %i:%i with only %s enabled',
    (book, chapter, number, id, rowId, english, translit) => {
      const ref = { translation: 'BSB', book, chapter }
      const verse = getChapter(ref).verses.find(v => v.verse === number)!
      const result = restoredVerseSegments(verse, ref, true, { ...noTerms, [id]: true })
      expect(result.find(span => span.token?.sourceWord?.rowId === rowId))
        .toMatchObject({ original: english, display: translit })
    })

  it('corroborates the inflected form of Jesus in John 11:35 in both editions', () => {
    for (const translation of ['BSB', 'KJV']) {
      const ref = { translation, book: 'John', chapter: 11 }
      const verse = getChapter(ref).verses.find(v => v.verse === 35)!
      const spans = restoredVerseSegments(verse, ref, true, { ...noTerms, G2424: true })
      expect(spans.find(s => s.original === 'Jesus')).toMatchObject({
        display: 'Iēsous', token: { sourceWord: { rowId: '92074', text: 'Ἰησοῦς' } }
      })
      expect(spans.map(s => s.original).join('')).toBe('Jesus wept.')
    }
  })

  it.each([
    ['Matt', 3, 16, 'G2424', 'He'],
    ['John', 2, 1, 'G2424', 'Jesus'],
    ['Ps', 33, 12, 'H430', 'God'],
    ['Ezek', 37, 1, 'H7307', 'Spirit'],
    ['Deut', 26, 19, 'H5945', 'high'],
    ['1Kgs', 5, 4, 'H7854', 'adversary'],
    ['2Tim', 3, 3, 'G1228', 'slanderous'],
    ['1Kgs', 21, 13, 'H1100', 'scoundrels']
  ] as const)('preserves the published sense in %s %i:%i when %s is enabled', (book, chapter, number, id, english) => {
    const ref = { translation: 'BSB', book, chapter }
    const verse = getChapter(ref).verses.find(v => v.verse === number)!
    expect(verse.tokens?.find(t => t.strongs === id)?.surface).toBe(english)
    const result = restoredVerseSegments(verse, ref, true, { ...noTerms, [id]: true })
    expect(result.map(s => s.display).join('')).toBe(verse.text)
  })
})
