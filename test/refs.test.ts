import { describe, it, expect } from 'vitest'
import { matchingBooks, parseScriptureRefs, typedPassage } from '../src/shared/refs'

describe('parseScriptureRefs', () => {
  const one = (s: string): ReturnType<typeof parseScriptureRefs>[number] => {
    const r = parseScriptureRefs(s)
    expect(r.length).toBe(1)
    return r[0]
  }

  it('parses a parenthetical citation', () => {
    const r = one('For God so loved the world (John 3:16) — the classic verse.')
    expect(r).toMatchObject({ book: 'John', chapter: 3, verse: 16 })
    expect('For God so loved the world ('.length).toBe(r.start) // link starts at "John"
  })

  it('parses a numbered book with a space', () => {
    expect(one('See 1 Corinthians 13:4 for love.')).toMatchObject({
      book: '1Cor',
      chapter: 13,
      verse: 4
    })
  })

  it('parses a numbered book without a space', () => {
    expect(one('1John 4:8 says God is love.')).toMatchObject({ book: '1John', chapter: 4, verse: 8 })
  })

  it('parses a multi-word book name', () => {
    expect(one('Song of Solomon 2:1 is poetic.')).toMatchObject({ book: 'Song', chapter: 2 })
  })

  it('parses common abbreviations', () => {
    expect(one('cf. Rom 8:28').book).toBe('Rom')
    expect(one('Ps 23:1').book).toBe('Ps')
    expect(one('Gen 1:1').book).toBe('Gen')
  })

  it('finds multiple references in one string', () => {
    const r = parseScriptureRefs('Compare Matthew 5:9 with James 3:18.')
    expect(r.map((x) => x.book)).toEqual(['Matt', 'Jas'])
  })

  it('sheds leading non-book words', () => {
    const r = one('the whole world John 1:1 in the beginning')
    expect(r.book).toBe('John')
    expect(r.start).toBe('the whole world '.length)
  })

  it('does not match ratios or non-book words', () => {
    expect(parseScriptureRefs('the ratio is 1:2 in the mix')).toHaveLength(0)
    expect(parseScriptureRefs('at 3:45 pm we met')).toHaveLength(0)
  })

  it('rejects impossible chapters', () => {
    expect(parseScriptureRefs('John 99:1')).toHaveLength(0) // John has 21 chapters
  })
})


it('opens the extra Swete psalm only in its native edition and requires the entire input to be a location', () => {
  expect(typedPassage('Psalm 151:1', 'LXX')).toMatchObject({ book: 'Ps', chapter: 151, firstVerse: 1 })
  expect(typedPassage('Psalm 151:1', 'KJV')).toBeUndefined()
  expect(typedPassage('John 3:16 stray text', 'BSB')).toBeUndefined()
  expect(typedPassage('before John 3:16', 'BSB')).toBeUndefined()
  expect(typedPassage('1 Jn 2:1', 'BSB')).toMatchObject({ book: '1John', chapter: 2, firstVerse: 1 })
})

it('accepts native verse and chapter ranges including a superscription or a single-chapter book', () => {
  expect(typedPassage('1 Jn 4:7–12', 'KJV')).toMatchObject({ book: '1John', chapter: 4, firstVerse: 7, lastChapter: 4, lastVerse: 12 })
  expect(typedPassage('1 Jn 4 : 19 – 5:2', 'NA')).toMatchObject({ firstVerse: 19, lastChapter: 5, lastVerse: 2 })
  expect(typedPassage('Jude 1–4', 'KJV')).toMatchObject({ chapter: 1, firstVerse: 1, lastChapter: 1, lastVerse: 4 })
  expect(typedPassage('Ps 151:0–1', 'LXX')).toMatchObject({ firstVerse: 0, lastVerse: 1 })
  expect(typedPassage('John 3–5', 'KJV')).toMatchObject({ chapter: 3, lastChapter: 5, lastVerse: undefined })
  expect(typedPassage('Ps 152:1', 'imp_example')).toMatchObject({ chapter: 152 })
  expect(typedPassage('John 4:7–3', 'KJV')).toBeUndefined()
  expect(typedPassage('John 4:7–3:10', 'KJV')).toBeUndefined()
  expect(matchingBooks('1 Jn')).toEqual(['1John'])
  expect(matchingBooks('John')).toEqual(expect.arrayContaining(['John','1John','2John','3John']))
})
