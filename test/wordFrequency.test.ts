import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { getWordFrequency, getWordFrequencyPassages } from '../src/main/db/wordFrequency'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

it('reports an unavailable frequency index for a missing or older Bible bundle', () => {
  const old = new DatabaseSync(':memory:')
  try {
    for (const db of [null, old]) {
      expect(getWordFrequency({ id: 'G26', edition: 'NA' }, db)).toMatchObject({ coverage: 'unavailable', books: [] })
      expect(getWordFrequencyPassages({ id: 'G26', edition: 'NA', book: 'John', chapter: 1 }, db)).toEqual([])
    }
  } finally {
    old.close()
  }
})

const path = 'resources/bible.sqlite'
const db = existsSync(path) ? new DatabaseSync(path, { readOnly: true }) : null
afterAll(() => db?.close())

describe.skipIf(!db)('source-linked word frequency in the bundled Bible', () => {
  it('reconciles all five Greek forms of agapē and counts its three uses in 1 John 4:16', () => {
    const query = { id: 'G26', edition: 'NA' } as const
    const summary = getWordFrequency(query, db)
    expect(summary).toMatchObject({ occurrences: 116, verses: 106, language: 'Greek' })
    expect(summary.forms.map(f => [f.morph,f.count])).toEqual([
      ['N-NSF',36], ['N-ASF',33], ['N-DSF',28], ['N-GSF',18], ['N-DPF',1]
    ])
    expect(summary.forms.every(form => form.translit)).toBe(true)
    expect(summary.books).toHaveLength(27)
    const verses = getWordFrequencyPassages({ ...query, book: '1John', chapter: 4 }, db)
    const verse = verses.find(v => v.verse === 16)!
    expect(verse.occurrences).toBe(3)
    expect(verse.tokens.filter(t => t.matching).map(t => t.text.normalize('NFC'))).toEqual(['ἀγάπην','ἀγάπη','ἀγάπῃ'])
    for (const form of summary.forms) {
      const filtered = getWordFrequency({ ...query, form: form.id }, db)
      expect(filtered.forms).toEqual(summary.forms)
      expect(filtered.occurrences).toBe(form.count)
      expect(filtered.tagged).toBe(summary.tagged)
      const chapter = filtered.books.find(b => b.book === '1John')!.chapters.find(c => c.chapter === 4)!
      const hits = getWordFrequencyPassages({ ...query, form: form.id, book: '1John', chapter: 4 }, db)
      expect(hits).toHaveLength(chapter.verses)
      expect(hits.flatMap(v => v.tokens).filter(t => t.matching)).toHaveLength(chapter.occurrences)
    }
  })

  it('distinguishes an edition-specific zero from an entry with no verified link in any supported edition', () => {
    const query = { id: 'G1207', edition: 'NA' } as const
    const absent = getWordFrequency(query, db)
    expect(absent).toMatchObject({ occurrences: 0, verses: 0, coverage: 'complete', forms: [] })
    expect(absent.notice).toContain('TR')
    expect(absent.books.every(b => b.occurrences === 0 && b.tagged > 0)).toBe(true)
    for (const edition of ['TR', 'BYZ'] as const) {
      expect(getWordFrequency({ ...query, edition }, db)).toMatchObject({ occurrences: 1, verses: 1 })
      expect(getWordFrequencyPassages({ ...query, edition, book: 'Luke', chapter: 6 }, db)).toMatchObject([{ verse: 1 }])
    }
    const unlinked = db!.prepare(`SELECT id FROM strongs_lexicon s WHERE s.language='greek'
      AND NOT EXISTS (SELECT 1 FROM word_frequency_occurrences f WHERE f.strongs=s.id)
      AND NOT EXISTS (SELECT 1 FROM word_frequency_gaps g WHERE g.strongs=s.id) LIMIT 1`).get()
    expect(getWordFrequency({ ...query, id: String(unlinked!.id) }, db)).toMatchObject({ occurrences: 0, coverage: 'partial' })
    const gap = db!.prepare("SELECT strongs FROM word_frequency_gaps WHERE edition='NA' LIMIT 1").get()
    expect(getWordFrequency({ ...query, id: String(gap!.strongs) }, db).coverage).toBe('partial')
    expect(getWordFrequency({ id: 'H9014', edition: 'MT' }, db)).toMatchObject({ coverage: 'unavailable', notice: expect.stringContaining('punctuation') })
  })

  it('preserves attached Hebrew components, native chapter numbering and the source language denominator', () => {
    const prefix = getWordFrequency({ id: 'H9003', edition: 'MT' }, db)
    expect(prefix.occurrences).toBeGreaterThan(1000)
    const gen = getWordFrequencyPassages({ id: 'H9003', edition: 'MT', book: 'Gen', chapter: 1 }, db)
    const start = gen.find(v => v.verse === 1)!.tokens
    expect(start[0]).toMatchObject({ matching: true, spaceBefore: false })
    expect(start[1]).toMatchObject({ matching: false, spaceBefore: false })
    expect((start[0].text + start[1].text).normalize('NFD').replace(/\p{M}/gu, '')).toBe('בראשית')

    const aramaic = getWordFrequency({ id: 'H426', edition: 'MT' }, db)
    expect(aramaic.language).toBe('Aramaic')
    expect(aramaic.books.find(b => b.book === 'Joel')!.chapters).toHaveLength(4)
    expect(aramaic.tagged).toBe(db!.prepare("SELECT sum(tagged_words) n FROM word_frequency_chapters WHERE edition='MT' AND language='aramaic'").get()!.n)
    expect(aramaic.books.find(b => b.book === 'Lev')!.tagged).toBe(0)
    const aramaicPrefix = prefix.forms.find(f => f.morph.startsWith('A'))!
    expect(getWordFrequency({ id: 'H9003', edition: 'MT', form: aramaicPrefix.id }, db))
      .toMatchObject({ language: 'Aramaic', tagged: aramaic.tagged, occurrences: aramaicPrefix.count })
    const verse = getWordFrequencyPassages({ id: 'G1410', edition: 'BYZ', book: 'Rom', chapter: 14 }, db).find(v => v.verse === 24)
    expect(verse?.readerRef).toEqual({ book: 'Rom', chapter: 16, verse: 25 })
  })

  it('keeps a genuine alternate lexical tag and counts a joined name once across multiple printed words', () => {
    expect(getWordFrequency({ id: 'G33', edition: 'NA' }, db)).toMatchObject({ occurrences: 3, alternateOccurrences: 3 })
    const jas = getWordFrequencyPassages({ id: 'G33', edition: 'NA',book: 'Jas',chapter: 4 }, db)
    expect(jas.find(v => v.verse === 13)!.tokens.filter(t => t.matching).map(t => t.text.normalize('NFC'))).toEqual(['Ἄγε'])
    const fused = { id: 'G2579', edition: 'NA' } as const
    const acts = getWordFrequencyPassages({ ...fused, book: 'Acts', chapter: 5 }, db)
    expect(acts.find(v => v.verse === 15)!.tokens.filter(t => t.matching).map(t => t.text)).toEqual(['κἂν'])
    // In 1 Corinthians 13:2 the fused spelling is explicitly assigned to other editions.
    expect(getWordFrequencyPassages({ ...fused, book: '1Cor', chapter: 13 }, db).some(v => v.verse === 2)).toBe(false)
    const matches = getWordFrequencyPassages({ id: 'H7163', edition: 'MT', book: 'Job', chapter: 42 }, db)
    const target = matches.find(v => v.verse === 14)!
    expect(target.occurrences).toBe(1)
    expect(target.tokens.filter(t => t.matching).map(t => t.text.replace(/\p{M}/gu, ''))).toEqual(['קרן','הפוך'])
  })

  it('every recorded use has a covered native chapter, dictionary identifier and exact original-token reference', () => {
    const invalid = db!.prepare(`SELECT f.strongs,f.edition,f.book_id,f.chapter,f.verse,f.position FROM word_frequency_occurrences f
      LEFT JOIN original_tokens t USING(edition,book_id,chapter,verse,position)
      LEFT JOIN word_frequency_chapters c ON c.edition=f.edition AND c.book_id=f.book_id
        AND c.language=f.language AND c.chapter=f.native_chapter
      WHERE t.edition IS NULL OR f.native_verse != t.native_verse OR f.native_chapter != t.native_chapter
        OR t.source_type IN ('R','X') OR c.tagged_words IS NULL OR c.tagged_words<1
        OR f.edition NOT IN ('MT','NA','BYZ','TR') OR f.surface_end<=f.surface_start OR f.surface_start<0
        OR (f.segments IS NULL AND replace(substr(t.original,f.surface_start+1,f.surface_end-f.surface_start),char(92),'') != f.surface)
        OR (NOT EXISTS(SELECT 1 FROM strongs_lexicon d WHERE d.id=f.strongs)
            AND NOT EXISTS(SELECT 1 FROM lexicon_entries d WHERE d.strongs=f.strongs))
      LIMIT 1`).get()
    expect(invalid).toBeUndefined()
    const joined = db!.prepare(`SELECT edition,strongs,book_id,chapter,verse,native_chapter,native_verse,surface,segments
      FROM word_frequency_occurrences WHERE segments IS NOT NULL`).all()
    const token = db!.prepare('SELECT original,native_chapter,native_verse FROM original_tokens WHERE edition=? AND book_id=? AND chapter=? AND verse=? AND position=?')
    for (const row of joined) {
      const segments: { position: number; start: number; end: number }[] = JSON.parse(String(row.segments))
      const slices = segments.map(part => {
        const t = token.get(row.edition,row.book_id,row.chapter,row.verse,part.position)!
        if (t.native_chapter !== row.native_chapter || t.native_verse !== row.native_verse) throw Error('Joined form crosses native verse')
        return String(t.original).slice(part.start, part.end).replace(/\\/g, '')
      })
      expect(slices.join(' ')).toBe(row.surface)
    }
  })
})
