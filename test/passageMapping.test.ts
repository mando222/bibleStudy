import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { mapChapter, mapChapterStart, mapPassage } from '../src/shared/passageMapping'

describe('Swete and English references', () => {
  const ps = (chapter: number, verse: number) => ({ book: 'Ps', chapter, verse })
  it('round-trips Psalm 22–24 references, including numbered headings', () => {
    for (const [source, target] of [
      [ps(21, 2), ps(22, 1)],
      [ps(22, 1), ps(23, 1)],
      [ps(22, 6), ps(23, 6)],
      [ps(23, 1), ps(24, 1)],
      [ps(50, 3), ps(51, 1)]
    ]) {
      expect(mapPassage(source, 'LXX', 'KJV')).toEqual(target)
      expect(mapPassage(target, 'BSB', 'LXX')).toEqual(source)
    }
  })
  it('maps the BSB and ASV Philippians transposition exactly once', () => {
    const a = { book: 'Phil', chapter: 1, verse: 16 }
    const b = { ...a, verse: 17 }
    for (const edition of ['KJV', 'NA', 'TR', 'BYZ']) {
      expect(mapPassage(a, 'BSB', edition)).toEqual(b)
      expect(mapPassage(b, edition, 'ASV')).toEqual(a)
    }
    expect(mapPassage(a, 'BSB', 'ASV')).toEqual(a)
    expect(mapPassage(b, 'NA', 'KJV')).toEqual(b)
  })
  it('preserves native references, supports a joined Psalm, and excludes Greek-only material', () => {
    expect(mapChapter({ book: 'Ps', chapter: 10 }, 'KJV', 'LXX')).toEqual({ book: 'Ps', chapter: 9 })
    expect(mapPassage(ps(9, 22), 'LXX', 'KJV')).toEqual(ps(10, 1))
    expect(mapChapterStart({ book: 'Ps', chapter: 10 }, 'KJV', 'LXX')).toEqual(ps(9, 22))
    expect(mapPassage(ps(151, 1), 'LXX', 'KJV')).toBeNull()
    expect(mapPassage(ps(151, 1), 'LXX', 'LXX')).toEqual(ps(151, 1))
    expect(mapPassage({ book: 'Dan', chapter: 3, verse: 50 }, 'LXX', 'KJV')).toBeNull()
    expect(mapPassage({ book: 'Jer', chapter: 28, verse: 1 }, 'LXX', 'KJV')).toEqual({
      book: 'Jer',
      chapter: 51,
      verse: 1
    })
  })
})

describe('bundled English verse numbering', () => {
  it('matches the closing blessing of Romans in WEB and KJV without creating a second copy', () => {
    for (let i = 0; i < 3; i++) {
      const web = { book: 'Rom', chapter: 14, verse: 24 + i }
      const kjv = { book: 'Rom', chapter: 16, verse: 25 + i }
      expect(mapPassage(web, 'WEB', 'KJV')).toEqual(kjv)
      expect(mapPassage(kjv, 'BSB', 'WEB')).toEqual(web)
      expect(mapPassage(kjv, 'WEB', 'KJV')).toBeNull()
      expect(mapPassage(web, 'KJV', 'WEB')).toBeNull()
    }
    const preceding = { book: 'Rom', chapter: 16, verse: 24 }
    expect(mapPassage(preceding, 'KJV', 'WEB')).toEqual(preceding)
  })

  it('maps the Geneva chapter break in Daniel in both directions including chapter navigation', () => {
    for (let verse = 1; verse <= 37; verse++) {
      const kjv = { book: 'Dan', chapter: 4, verse }
      const geneva = { book: 'Dan', chapter: verse <= 3 ? 3 : 4, verse: verse <= 3 ? verse + 30 : verse - 3 }
      expect(mapPassage(kjv, 'KJV', 'GNV')).toEqual(geneva)
      expect(mapPassage(geneva, 'GNV', 'BSB')).toEqual(kjv)
    }
    expect(mapChapterStart({ book: 'Dan', chapter: 4 }, 'KJV', 'GNV')).toEqual({ book: 'Dan', chapter: 3, verse: 31 })
    expect(mapChapterStart({ book: 'Dan', chapter: 4 }, 'GNV', 'KJV')).toEqual({ book: 'Dan', chapter: 4, verse: 4 })
    expect(mapPassage({ book: 'Dan', chapter: 4, verse: 35 }, 'GNV', 'KJV')).toBeNull()
    expect(mapPassage({ book: 'Dan', chapter: 3, verse: 31 }, 'KJV', 'GNV')).toBeNull()
    expect(mapPassage({ book: 'Dan', chapter: 3, verse: 31 }, 'GNV', 'LXX')).toBeNull()
  })

  it.skipIf(!existsSync('resources/bible.sqlite'))('identifies the moved material in the published verses', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const db = new DatabaseSync('resources/bible.sqlite', { readOnly: true })
    try {
      const look = db.prepare('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=? AND verse=?')
      for (const [edition, book, chapter, verse, nativeWords, kjvWords] of [
        ['WEB', 'Rom', 14, 24, 'my Good News', 'my gospel'],
        ['WEB', 'Rom', 14, 25, 'Scriptures of the prophets', 'scriptures of the prophets'],
        ['WEB', 'Rom', 14, 26, 'only wise God', 'only wise'],
        ['GNV', 'Dan', 3, 31, 'Peace be multiplied', 'Peace be multiplied'],
        ['GNV', 'Dan', 4, 1, 'at rest in mine house', 'at rest in mine house'],
        ['GNV', 'Dan', 4, 34, 'King of heauen', 'King of heaven']
      ] as const) {
        const kjv = mapPassage({ book, chapter, verse }, edition, 'KJV')!
        expect(look.get(edition, book, chapter, verse)?.text).toContain(nativeWords)
        expect(look.get('KJV', kjv.book, kjv.chapter, kjv.verse)?.text).toContain(kjvWords)
      }
    } finally {
      db.close()
    }
  })
})
