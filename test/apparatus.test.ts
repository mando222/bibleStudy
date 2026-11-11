import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { readChapterApparatus, readOriginalVerse } from '../src/main/db/apparatus'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const db = existsSync('resources/bible.sqlite') ? new DatabaseSync('resources/bible.sqlite', { readOnly: true }) : null
afterAll(() => db?.close())

describe.skipIf(!db)('offline edition witnesses', () => {
  it('keeps each complete recorded reading in the published order for John 1:18, including the Byzantine edition', () => {
    const result = readOriginalVerse(db!, { book: 'John', chapter: 1, verse: 18, translation: 'BSB' })
    if (result.kind !== 'greek') throw Error('Greek readings missing')
    for (const id of ['NA', 'TR', 'BYZ'] as const) {
      const words = result.readings[id]!.words.map(w => w.surface)
      const recorded = db!.prepare('SELECT original FROM original_tokens WHERE edition=? AND book_id=? AND chapter=? AND verse=? ORDER BY position').all(id, 'John', 1, 18)
      expect(words).toEqual(recorded.map(r => r.original))
    }
    const critical = result.readings.NA!.words.map(w => w.surface).join(' ').normalize('NFC')
    expect(critical).toContain('μονογενὴς θεὸς')
    expect(result.readings.BYZ!.words.map(w => w.surface)).toEqual(result.readings.TR!.words.map(w => w.surface))
    expect(result.readings.TR!.words.map(w => w.surface).join(' ').normalize('NFC')).toContain('ὁ μονογενὴς υἱός')
  })

  it('detects a BYZ-only difference and two inflected forms with the same dictionary ID', () => {
    const byz = readChapterApparatus(db!, 'Matt', 4).find(v => v.verse === 10)
    if (byz?.kind !== 'greek') throw Error('Matthew 4:10 missing')
    expect(byz.readings.BYZ!.words.map(w => w.surface).join(' ').normalize('NFC')).toContain('ὀπίσω μου')
    expect(byz.readings.NA!.words.map(w => w.surface)).toEqual(byz.readings.TR!.words.map(w => w.surface))
    const chapter = readChapterApparatus(db!, '1John', 2)
    const variant = chapter.find(v => v.verse === 20)
    if (variant?.kind !== 'greek') throw Error('Missing 1 John 2:20')
    expect(variant.readings.NA!.words.find(w => w.strongs === 'G3956')!.surface.normalize('NFC')).toContain('πάντες')
    expect(variant.readings.TR!.words.find(w => w.strongs === 'G3956')!.surface.normalize('NFC')).toContain('πάντα')
    const split = chapter.find(v => v.verse === 13)
    if (split?.kind !== 'greek') throw Error('Missing 1 John 2:13')
    expect(split.readings.NA!.nativeRefs).toEqual(['2:13', '2:14'])
    expect(chapter.some(v => v.verse === 1)).toBe(false)
    const agree = readOriginalVerse(db!, { book: '1John', chapter: 2, verse: 1, translation: 'BSB' })
    if (agree.kind !== 'greek') throw Error('Missing selected verse')
    expect(Object.keys(agree.readings).sort()).toEqual(['BYZ', 'NA', 'TR'])
  })

  it('distinguishes a missing reading, native Septuagint numbering and an unverified imported reference', () => {
    const omitted = readOriginalVerse(db!, { book: 'Acts', chapter: 8, verse: 37, translation: 'KJV' })
    if (omitted.kind !== 'greek') throw Error('Expected Greek comparison')
    expect(omitted.readings.NA).toBeUndefined()
    expect(omitted.readings.TR!.words.length).toBeGreaterThan(0)
    const psalm = readOriginalVerse(db!, { book: 'Ps', chapter: 23, verse: 1, translation: 'BSB' })
    if (psalm.kind !== 'ot') throw Error('Expected separate Hebrew and Greek readings')
    expect(psalm.lxx?.ref).toEqual({ book: 'Ps', chapter: 22, verse: 1 })
    expect(psalm.lxx?.text).toContain('Κύριος ποιμαίνει με')
    expect(psalm.mt.words.length).toBeGreaterThan(0)
    const pair = readOriginalVerse(db!, { book: '1Chr', chapter: 1, verse: 11, translation: 'KJV' })
    if (pair.kind !== 'ot') throw Error('Expected a Masoretic variant')
    expect(pair.mt.pairs).toEqual([expect.objectContaining({ qere: 'לוּדִ֧ים', ketiv: 'לוּדִיִּים', qereStrongs: 'H3866' })])
    expect(pair.mt.words.some(w => w.sourceType?.startsWith('Q'))).toBe(true)
    expect(readOriginalVerse(db!, { book: 'Ps', chapter: 23, verse: 1, translation: 'imp_test' }).kind).toBe('unmapped')
  })

  it('shows an unmapped native Greek verse and withholds numerals, editorial debris and truncated Swete readings', () => {
    const ps151 = readOriginalVerse(db!, { translation: 'LXX', book: 'Ps', chapter: 151, verse: 1 })
    if (ps151.kind !== 'ot') throw Error('Expected the selected Swete reading')
    expect(ps151.nativeLxxOnly).toBe(true)
    expect(ps151.mt.words).toEqual([])
    expect(ps151.lxx?.text).toContain('Μικρὸς ἤμην')
    const cases = [
      { translation: 'LXX', book: 'Exod', chapter: 20, verse: 1, reason: 'chapter numeral' },
      { translation: 'BSB', book: '2Kgs', chapter: 23, verse: 31, reason: 'editorial notes' },
      { translation: 'BSB', book: 'Job', chapter: 2, verse: 9, reason: 'lettered sections' }
    ]
    for (const { reason, ...ref } of cases) {
      const ot = readOriginalVerse(db!, ref)
      if (ot.kind !== 'ot') throw Error('Expected a checked Greek witness')
      expect(ot.lxx?.text).toBeNull()
      expect(ot.lxx?.issue).toContain(reason)
    }
  })
})

it('reads legacy tokens without inventing witness types, native numbers, or readings for missing editions', () => {
  const old = new DatabaseSync(':memory:')
  try {
    old.exec(`CREATE TABLE original_tokens(edition,book_id,chapter,verse,position,original,strongs,translit,gloss);
      CREATE TABLE editions(id); CREATE TABLE translations(id); CREATE TABLE verses(translation_id,book_id,chapter,verse,text);
      INSERT INTO translations VALUES('KJV');
      INSERT INTO original_tokens VALUES('TR','John',1,1,0,'Ἐν','G1722','En','in');
      INSERT INTO original_tokens VALUES('MT','Gen',1,1,0,'בְּרֵאשִׁית',NULL,NULL,NULL);`)
    const greek = readOriginalVerse(old, { book: 'John', chapter: 1, verse: 1, translation: 'KJV' })
    if (greek.kind !== 'greek') throw Error('Expected Greek comparison')
    expect(greek.readings.TR?.nativeRefs).toEqual([])
    expect(greek.readings.TR?.orderStatus).toBe('unknown')
    expect(greek.readings.NA).toBeUndefined()
    expect(readChapterApparatus(old, 'John', 1)).toHaveLength(1)
    const hebrew = readOriginalVerse(old, { book: 'Gen', chapter: 1, verse: 1, translation: 'KJV' })
    if (hebrew.kind !== 'ot') throw Error('Expected Hebrew reading')
    expect(hebrew.mt.words[0]).toEqual({ surface: 'בְּרֵאשִׁית', sourceType: null })
    expect(hebrew.mt.pairs).toEqual([])
    old.exec("CREATE TABLE greek_order_uncertainties(edition,book_id,chapter,verse); INSERT INTO greek_order_uncertainties VALUES('TR','John',1,1)")
    const checked = readOriginalVerse(old, { book: 'John', chapter: 1, verse: 1, translation: 'KJV' })
    expect(checked.kind === 'greek' && checked.readings.TR?.orderStatus).toBe('unverified')
  } finally { old.close() }
})
