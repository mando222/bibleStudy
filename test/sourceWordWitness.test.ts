import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSourceWordSpans } from '../data-pipeline/sourceWords'
import { SOURCE_WORD_ALIGNMENT_VERSION } from '../src/shared/sourceWords'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const schema = readFileSync('data-pipeline/schema.sql', 'utf8')
const greek = { book: 'John', name: 'John', language: 'Greek', id: 'G25', word: 'ἠγάπησεν', roman: 'ēgapēsen', en: 'loved' }
const hebrew = { book: 'Gen', name: 'Genesis', language: 'Hebrew', id: 'H430', word: 'אֱלֹהִים', roman: 'ĕlōhîm', en: 'God' }
const aramaic = { book: 'Dan', name: 'Daniel', language: 'Aramaic', id: 'H426', word: 'אֱלָהּ', roman: 'ĕlāh', en: 'God' }

type Witness = { form: string; id: string | null; edition: string; morph: string; type?: string; verse?: number }
const tr: Witness = { form: 'ἠγάπησεν.', id: greek.id, edition: 'TR', morph: 'V-AAI-3S' }
const mt: Witness = { form: 'אֱלֹהִים\\׃', id: hebrew.id, edition: 'MT', morph: 'HNcmpa', type: 'L' }
const mtAramaic: Witness = { form: aramaic.word, id: aramaic.id, edition: 'MT', morph: 'ANcmsa', type: 'L' }

function linkedEditions(source: typeof greek, witnesses: Witness[], kjvEnglish = source.en, publisherEnglish = source.en): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'bible-source-word-'))
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(schema)
    const fields = Array<string>(19).fill('')
    const isGreek = source.language === 'Greek'
    fields[isGreek ? 1 : 0] = '10'
    fields[4] = source.language
    fields[5] = fields[6] = source.word
    fields[7] = source.roman
    fields[isGreek ? 11 : 10] = source.id.slice(1)
    fields[12] = `${source.name} 1:1`
    fields[18] = publisherEnglish
    const table = join(dir, 'source.tsv')
    writeFileSync(table, 'header\n' + fields.join('\t'))
    const token = db.prepare(`INSERT INTO verse_tokens
      (translation_id, book_id, chapter, verse, position, surface, trailer, strongs, lemma, translit)
      VALUES (?,?,1,1,0,?,'.',?,?,?)`)
    token.run('BSB', source.book, source.en, source.id, source.word, source.roman)
    token.run('KJV', source.book, kjvEnglish, source.id, null, null)
    const original = db.prepare(`INSERT INTO original_tokens
      (edition,book_id,chapter,verse,position,original,strongs,morph,source_type) VALUES (?,?,1,?,?,?,?,?,?)`)
    witnesses.forEach((w, i) => {
      original.run(w.edition, source.book, w.verse ?? 1, i, w.form, w.id, w.morph, w.type ?? null)
    })
    buildSourceWordSpans(db, table)
    expect(db.prepare("SELECT value FROM meta WHERE key='source_word_alignment_version'").get()?.value)
      .toBe(SOURCE_WORD_ALIGNMENT_VERSION)
    return db.prepare('SELECT translation_id FROM source_word_spans ORDER BY translation_id')
      .all().map(r => String(r.translation_id))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('independent source words for KJV restoration', () => {
  it('accepts the unique source form across canonical Unicode and editorial punctuation', () => {
    expect(linkedEditions(greek, [tr])).toEqual(['BSB', 'KJV'])
    expect(linkedEditions(hebrew, [mt])).toEqual(['BSB', 'KJV'])
    expect(linkedEditions(aramaic, [mtAramaic])).toEqual(['BSB', 'KJV'])
  })

  it('requires the same word, inflection, language, address and edition', () => {
    expect(linkedEditions(greek, [{ ...tr, form: 'ἠγάπησα' }, { ...tr, edition: 'NA' }])).toEqual(['BSB'])
    expect(linkedEditions(greek, [{ ...tr, form: 'ἡγάπησεν' }])).toEqual(['BSB'])
    expect(linkedEditions(greek, [{ ...tr, verse: 2 }])).toEqual(['BSB'])
    expect(linkedEditions(hebrew, [{ ...mt, form: 'אֱלָהִים' }])).toEqual(['BSB'])
    expect(linkedEditions(hebrew, [{ ...mt, form: 'וֵאֱלֹהִים' }])).toEqual(['BSB'])
    expect(linkedEditions(aramaic, [{ ...mtAramaic, morph: 'HNcmsa' }])).toEqual(['BSB'])
    expect(linkedEditions(greek, [tr], 'loveth')).toEqual(['BSB'])
  })

  it('abstains on repetitions, untagged compound readings and written/read variants', () => {
    expect(linkedEditions(greek, [tr, { ...tr, form: 'ἠγάπησα' }])).toEqual(['BSB'])
    expect(linkedEditions(greek, [tr, { ...tr, id: null, form: 'καὶ ἠγάπησεν' }])).toEqual(['BSB'])
    expect(linkedEditions(hebrew, [mt, { ...mt, id: null, form: 'אֱלֹהִים\\׃\\ \\ס' }])).toEqual(['BSB'])
    for (const type of ['Q(K)', 'Q(k)', 'R', 'X', '']) {
      expect(linkedEditions(hebrew, [{ ...mt, type }])).toEqual(['BSB'])
    }
  })

  it('requires direct manuscript attestation for the divine name as well', () => {
    const name = { ...hebrew, id: 'H3068', word: 'יְהוָה', roman: 'Yahweh', en: 'LORD' }
    const witness = { ...mt, id: name.id, form: name.word }
    expect(linkedEditions(name, [{ ...witness, type: 'L(p)' }])).toEqual(['BSB', 'KJV'])
    expect(linkedEditions(name, [{ ...witness, type: 'X' }])).toEqual(['BSB'])
  })

  it('keeps internal punctuation and possessives when comparing the publisher English span', () => {
    expect(linkedEditions(greek, [tr], 'loved', 'lo-ved')).toEqual([])
    expect(linkedEditions(greek, [tr], 'loved', 'loved’')).toEqual([])
    expect(linkedEditions(greek, [tr], 'loved', 'loved)')).toEqual(['BSB', 'KJV'])
  })
})
