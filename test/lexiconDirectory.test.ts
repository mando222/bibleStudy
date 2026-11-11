import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import { bibleDb, browseLexicon, getLexiconEntries, getStrongs } from '../src/main/db/bible'
import { describeFrequencyMorph } from '../src/shared/frequencyMorphology'
import { lexiconId } from '../src/shared/lexiconId'

vi.mock('node:sqlite', () => createRequire(import.meta.url)('node:sqlite'))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

describe.skipIf(!existsSync('resources/bible.sqlite'))('dictionary coverage', () => {
  it('opens the Hebrew suffix in Genesis 1:11 even though it has no historical Strong’s entry', () => {
    const row = bibleDb()!.prepare("SELECT strongs FROM original_tokens WHERE edition='MT' AND book_id='Gen' AND chapter=1 AND verse=11 AND strongs='H9033'").get()
    expect(row?.strongs).toBe('H9033')
    expect(browseLexicon({ language: 'hebrew', query: 'H9033' }).entries[0]).toMatchObject({id: 'H9033', gloss: 'him'})
    expect(getStrongs('H9033')).toMatchObject({id:'H9033', lexiconSource:'STEP', lemma:'וֹ', kjvDef:null})
    expect(getLexiconEntries('H9033')[0].entries[0].body).toContain('Personal object pronoun')
    expect(getStrongs('H99999')).toBeNull()
  })
  it('finds pointed Hebrew headwords with consonants and accepts padded dictionary references', () => {
    expect(browseLexicon({language:'hebrew',query:'אלהים',limit:400}).entries.map(x=>x.id)).toContain('H430')
    expect(getStrongs('h0430')?.id).toBe('H430')
    expect(getLexiconEntries('h0430')).toEqual(getLexiconEntries('H430'))
  })
  it('resolves the H02 reference from Abba and every other padded link printed in the dictionaries', () => {
    expect(getStrongs('G5')?.definition).toContain('(H02)')
    expect(getStrongs('H02')).toMatchObject({id:'H2', lemma:'אַב', sourceLanguage:'Aramaic'})
    const rows = bibleDb()!.prepare('SELECT definition,derivation,kjv_def FROM strongs_lexicon').all()
    const links = new Set(rows.flatMap(r => Object.values(r).join(' ').match(/\b[HG]0\d{1,4}\b/g) ?? []))
    expect(links.size).toBeGreaterThan(250)
    for (const printed of links) expect(getStrongs(printed)?.id, printed).toBe(lexiconId(printed))
  })
  it('keeps every documented numeric headword browsable and the vocabulary glosses populated', () => {
    const db = bibleDb()!
    expect(db.prepare(`SELECT COUNT(*) n FROM (SELECT id FROM strongs_lexicon UNION SELECT strongs FROM lexicon_entries EXCEPT SELECT id FROM lexicon_headwords)`).get()?.n).toBe(0)
    expect(db.prepare("SELECT COUNT(*) n FROM vocab WHERE gloss IS NULL OR trim(gloss)='' OR lemma=strongs").get()?.n).toBe(0)
  })
})

it('expands Greek and Semitic form codes without guessing unknown analyses', () => {
  expect(describeFrequencyMorph('N-DPF')).toBe('Noun · Dative · Plural · Feminine')
  expect(describeFrequencyMorph('HC/Ncmsa')).toBe('Conjunction + Noun · Common · Masculine · Singular · Absolute')
  expect(describeFrequencyMorph('unknown')).toBe('unknown')
})
