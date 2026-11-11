import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { getChapter, getComparisonVerse, getConcordance, getInterlinear, search } from '../src/main/db/bible'
import { searchImportedText } from '../src/main/db/search'
import { namedPassages } from '../src/shared/refs'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

describe('imported text search', () => {
  const d = new DatabaseSync(':memory:')
  afterAll(() => d.close())
  it('searches an existing module, scopes results and refreshes the index after a replacement', () => {
    d.exec(`CREATE TABLE imported_verses(translation_id,book_id,chapter,verse,text,
            PRIMARY KEY(translation_id,book_id,chapter,verse));
      INSERT INTO imported_verses VALUES ('mine','Gen',1,1,'Shepherd'),('mine','John',1,1,'Shepherd'),
                                        ('mine','John',1,2,'θεὸς'),('other','Luke',1,1,'Shepherd')`)
    expect(searchImportedText(d, { text: 'shepherd', translation: 'mine', testament: 'NT' }).hits)
      .toMatchObject([{ book: 'John', translation: 'mine' }])
    expect(searchImportedText(d, { text: 'θεος', translation: 'mine' }).total).toBe(1)
    d.exec("INSERT OR REPLACE INTO imported_verses VALUES('mine','John',1,1,'Book')")
    expect(searchImportedText(d, { text: 'shepherd', translation: 'mine' }).total).toBe(1)
    expect(searchImportedText(d, { text: 'G26', translation: 'mine' }).notice).toContain('no Strong')
  })
})

it('parses named verses, ranges, chapters and single-chapter books without turning clock times into references', () => {
  expect(namedPassages('Compare John 3:16–18 with 1 Cor. 13:4–14:1, Psalm 23 and Jude 5. At 3:16.'))
    .toEqual([
      { book: 'John', chapter: 3, lastChapter: 3, firstVerse: 16, lastVerse: 18 },
      { book: '1Cor', chapter: 13, lastChapter: 14, firstVerse: 4, lastVerse: 1 },
      { book: 'Ps', chapter: 23, lastChapter: 23, firstVerse: undefined, lastVerse: undefined },
      { book: 'Jude', chapter: 1, lastChapter: 1, firstVerse: 5, lastVerse: 5 }
    ])
})

describe.skipIf(!existsSync('resources/bible.sqlite'))('real Scripture search and parallel reading', () => {
  it('reads the exact verse for a comparison and supplies source evidence only for aligned editions', () => {
    for (const translation of ['KJV', 'BSB']) {
      const ref = { translation, book: 'Ps', chapter: 23, verse: 1 }
      const verse = getComparisonVerse(ref)
      const native = getChapter(ref).verses.find(v => v.verse === ref.verse)!
      expect(verse).toEqual({ verse: native.verse, text: native.text, tokens: native.tokens })
      expect(native.layout?.some(mark => mark.kind === 'poetry')).toBe(true)
      expect(verse?.tokens?.find(t => t.sourceWord)?.sourceWord?.rowId).toBe('344393')
    }
    expect(getComparisonVerse({ translation: 'ASV', book: 'Ps', chapter: 23, verse: 1 }))
      .toEqual({ verse: 1, text: 'Jehovah is my shepherd; I shall not want.', tokens: null })
    expect(getComparisonVerse({ translation: 'BSB', book: 'Acts', chapter: 8, verse: 37 })).toBeNull()
    expect(getComparisonVerse({ translation: 'KJV', book: 'Ps', chapter: 23, verse: NaN })).toBeNull()
  })

  it('links the whole English name in Psalm 23:1 to the precise published Berean row', () => {
    for (const translation of ['BSB', 'KJV']) {
      const verse = getChapter({ translation, book: 'Ps', chapter: 23 }).verses.find(v => v.verse === 1)!
      const token = verse.tokens!.find(t => t.strongs === 'H3068')!
      const word = token.sourceWord!
      expect(word).toEqual({
        edition: 'BSB', language: 'Hebrew', strongs: 'H3068', morph: 'Noun - proper - masculine singular',
        rowId: '344393', book: 'Ps', chapter: 23, verse: 1,
        startPosition: 0, endPosition: translation === 'BSB' ? 0 : 1, english: 'The LORD', text: 'יְהוָ֥ה',
        translit: 'Yah·weh', evidence: translation === 'BSB' ? 'aligned' : 'corroborated'
      })
      expect(verse.tokens!.slice(word.startPosition, word.endPosition + 1)
        .map((t, i) => t.surface + (i + word.startPosition === word.endPosition ? '' : t.trailer)).join('')).toBe(word.english)
    }
  })

  it('carries the inflected original, including possessives and different forms of the same verb', () => {
    const tokens = (book: string, chapter: number, verse: number) =>
      getChapter({ translation: 'BSB', book, chapter }).verses.find(v => v.verse === verse)!.tokens!
    const god = tokens('Deut', 6, 4).find(t => t.strongs === 'H430')!
    expect(god.sourceWord).toMatchObject({ english: 'our God', text: 'אֱלֹהֵ֖ינוּ', translit: '’ĕ·lō·hê·nū' })
    const love = tokens('John', 13, 34).filter(t => t.strongs === 'G25')
    expect(love.map(t => t.sourceWord?.text)).toEqual(['ἀγαπᾶτε', 'ἠγάπησα', 'ἀγαπᾶτε'])
    expect(new Set(love.map(t => t.sourceWord?.rowId)).size).toBe(3)
  })

  it('withholds source forms on inferred translations and uncorroborated KJV occurrences', () => {
    for (const ref of [{ translation: 'ASV', book: 'Ps', chapter: 23, verse: 1 },
      { translation: 'KJV', book: 'Deut', chapter: 6, verse: 4 }]) {
      const tokens = getChapter(ref).verses.find(v => v.verse === ref.verse)!.tokens!
      expect(tokens.some(t => !!t.strongs)).toBe(true)
      expect(tokens.some(t => t.sourceWord)).toBe(false)
    }
  })

  it('corroborates only the bare name when KJV and Berean phrase the verse differently', () => {
    const verse = (translation: string) => getChapter({ translation, book: 'Ps', chapter: 1 })
      .verses.find(v => v.verse === 6)!
    const kjv = verse('KJV')
    expect(kjv.text).not.toBe(verse('BSB').text)
    const words = kjv.tokens!.flatMap(t => t.sourceWord ? [t.sourceWord] : [])
    expect(words).toHaveLength(1)
    expect(words[0]).toMatchObject({ english: 'the LORD', evidence: 'corroborated', text: 'יְ֭הוָה' })
    const gen = getChapter({ translation: 'KJV', book: 'Gen', chapter: 4 })
    // The KJV provider prints "the LORD." with no Strong's tag in 4:1. The concordance's
    // subsequent capitalization-based backfill cannot count as an independent witness.
    const backfill = gen.verses.find(v => v.verse === 1)!.tokens!.find(t => t.strongs === 'H3068')
    expect(backfill?.surface).toBe('LORD')
    expect(backfill?.sourceWord).toBeUndefined()
    const prefixed = gen.verses.find(v => v.verse === 3)!.tokens!.find(t => t.strongs === 'H3068')
    expect(prefixed).toBeDefined()
    expect(prefixed!.sourceWord).toBeUndefined()
    const nums = getChapter({ translation: 'KJV', book: 'Num', chapter: 11 }).verses.find(v => v.verse === 29)!
    expect(nums.tokens!.filter(t => t.strongs === 'H3068').map(t => t.sourceWord)).toEqual([undefined, undefined])
  })
  it('honors a Strong’s query’s edition, book and testament, including an empty inferred result', () => {
    expect(search({ text: 'G26', translation: 'BSB', testament: 'OT' }).total).toBe(0)
    expect(search({ text: 'G26', translation: 'BSB', testament: 'NT', limit: 2 }).total).toBe(106)
    expect(search({ text: 'G26', translation: 'ASV', book: 'Gen' }).total).toBe(0)
    expect(search({ text: 'G26', translation: 'BSB', book: '1John', limit: 2 }).hits)
      .toMatchObject([{ book: '1John', translation: 'BSB' }, { book: '1John', translation: 'BSB' }])
  })
  it('searches the selected Greek NT edition in the NT and opens hits in their matched edition', () => {
    const hits = search({ text: 'ἀγάπη', book: '1Cor', testament: 'NT', translation: 'KJV', greekEdition: 'TR' }).hits
    expect(hits).toContainEqual(expect.objectContaining({ edition: 'TR', translation: 'TR', chapter: 13, verse: 4 }))
    expect(hits.every(h => h.book === '1Cor')).toBe(true)
    expect(search({ text: 'θεὸς', translation: 'KJV', testament: 'OT', limit: 1 }).hits[0].translation).toBe('LXX')
  })
  it('highlights only the noun in 1 John 4:7 even when a verb is also rendered “love”', () => {
    const hit = getConcordance('G26', { translation: 'KJV', book: '1John' }).hits
      .find(h => h.chapter === 4 && h.verse === 7)
    expect(hit?.snippet).toMatch(/let us love one another/i)
    expect(hit?.snippet).toMatch(/for \{\{love\}\} is of God/i)
  })
  it('stacks the corresponding words when BSB and ASV reverse Philippians 1:16–17', () => {
    const chapter = getInterlinear('Phil', 1, 'NA', ['BSB','ASV','KJV'])
    const noun = chapter.verses.find(v => v.verse === 17)?.tokens.find(t => t.strongs === 'G26')
    expect(noun?.aligned).toMatchObject({ BSB: 'love', ASV: expect.stringMatching(/love/i), KJV: 'love' })
    const rivalry = chapter.verses.find(v => v.verse === 16)?.tokens.find(t => t.strongs === 'G2052')
    expect(rivalry?.aligned?.BSB).toBe('selfish ambition')
  })
  it('stacks English Psalm 23 under the equivalent Greek Psalm 22', () => {
    const first = getInterlinear('Ps', 22, 'LXX', ['KJV']).verses.find(v => v.verse === 1)
    expect(first?.lines?.[0]).toMatchObject({ id: 'KJV', ref: '23:1', text: expect.stringContaining('my shepherd') })
  })
})
