import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { bibleDb, getInterlinear } from '../src/main/db/bible'
import { sweteEditionLabel, sweteReadingIssue } from '../src/shared/lxxIntegrity'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

it('distinguishes Greek forms from Roman numerals and identifies Theodotion in Daniel', () => {
  expect(sweteReadingIssue({ book: 'Exod', chapter: 20, verse: 1 }, 'XX')).toMatch(/chapter numeral/)
  expect(sweteReadingIssue({ book: 'Gen', chapter: 1, verse: 1 }, 'ΕΝ ΑΡΧΗ ἐποίησεν')).toBeNull()
  expect(sweteReadingIssue({ book: 'Job', chapter: 2, verse: 9 }, 'προβεβηκότος')).toMatch(/lettered sections/)
  expect(sweteEditionLabel('Dan')).toContain('Theodotion')
  expect(sweteEditionLabel('Gen')).toContain('Septuagint')
})

describe.skipIf(!existsSync('resources/bible.sqlite'))('bundled Swete interlinear', () => {
  afterAll(() => bibleDb()?.close())

  it('keeps the Greek form, transliteration and separately mapped translation, without inferred NT analysis', () => {
    const first = getInterlinear('Gen', 1, 'LXX', ['KJV'], true).verses.find(v => v.verse === 1)!
    const verb = first.tokens.find(t => t.lemma === 'ἐποίησεν')
    expect(verb).toMatchObject({ surface: '', gloss: null, strongs: null, morph: null, translit: 'epoiēsen' })
    expect(verb?.parses).toBeUndefined()
    expect(verb?.aligned).toBeUndefined()
    expect(first.lines?.find(l => l.id === 'KJV')?.text).toContain('created')
  })

  it.each([
    ['Exod', 20, 1, 'chapter numeral'], ['Num', 17, 1, 'chapter numeral'], ['Num', 19, 1, 'chapter numeral'],
    ['1Kgs', 14, 1, 'chapter numeral'], ['1Kgs', 16, 1, 'chapter numeral'],
    ['2Kgs', 23, 31, 'editorial notes'], ['Job', 2, 9, 'lettered sections']
  ] as const)('withholds the incomplete or mixed reading at %s %i:%i', (book, chapter, verse, reason) => {
    const verses = getInterlinear(book, chapter, 'LXX', ['KJV']).verses
    const row = verses.find(v => v.verse === verse)
    expect(row?.sourceIssue).toContain(reason)
    expect(row?.tokens).toEqual([])
    expect(row?.lines).toBeUndefined()
    expect(verses.some(v => v.tokens.length && !v.sourceIssue)).toBe(true)
  })
})
