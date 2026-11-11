import { describe, expect, it } from 'vitest'
import { restoredVerseSegments } from '../src/shared/sourceWords'
import { literaryGroups } from '../src/shared/literaryLayout'
import type { ChapterRef, SourceWord, Verse, VerseToken } from '../src/shared/types'

const ref: ChapterRef = { translation: 'BSB', book: 'Ps', chapter: 23 }
const source: SourceWord = {
  text: 'יְהוָ֥ה', translit: 'Yah·weh', language: 'Hebrew', rowId: '344393', edition: 'BSB',
  strongs: 'H3068', morph: 'Noun - proper - masculine singular',
  book: 'Ps', chapter: 23, verse: 1, startPosition: 0, endPosition: 0, english: 'The LORD', evidence: 'aligned'
}

function word(position: number, surface: string, trailer: string, strongs: string | null = null, sourceWord?: SourceWord): VerseToken {
  return { position, surface, trailer, strongs, sourceWord, lemma: null, translit: null, morph: null, gloss: null }
}
function verse(tokens: VerseToken[]): Verse {
  return { verse: 1, text: tokens.map(t => t.surface + t.trailer).join(''), tokens }
}
const display = (v: Verse, terms = {}, where = ref) =>
  restoredVerseSegments(v, where, true, terms).map(s => s.display).join('')

describe('verified word restoration', () => {
  it('shows a fixed consonantal rendering and preserves the full published wording for quotations', () => {
    const v = verse([word(0, 'The LORD', ' ', 'H3068', source), word(1, 'is my shepherd', '.')])
    const spans = restoredVerseSegments(v, ref, true)
    expect(spans.map(s => s.display).join('')).toBe('YHWH is my shepherd.')
    expect(spans.map(s => s.original).join('')).toBe(v.text)
    expect(display(v, { H3068: 'another name' })).toBe('YHWH is my shepherd.')
    expect(display(v, { H3068: false })).toBe(v.text)
    expect(restoredVerseSegments(v, ref, false).map(s => s.display).join('')).toBe(v.text)
  })
  it('only includes an adjoining article when the evidence covers it on the English side', () => {
    const src = { ...source, endPosition: 1, evidence: 'corroborated' as const }
    const v = verse([word(0, 'The', ' '), word(1, 'LORD', '', 'H3068', src)])
    const kjv = { ...ref, translation: 'KJV' }
    expect(display(v, {}, kjv)).toBe('YHWH')
    expect(display(verse([word(0, 'For', ' '), word(1, 'LORD', '.', 'H3068', src)]), {}, kjv)).toBe('For LORD.')
  })
  it('uses the transliteration for the actual inflected word when its term is enabled', () => {
    const greek: SourceWord = { ...source, text: 'ἠγάπησεν', translit: 'ēgapēsen', language: 'Greek', english: 'loved', strongs: 'G25' }
    const v = verse([word(0, 'loved', ',', 'G25', greek)])
    expect(display(v)).toBe('loved,')
    expect(display(v, { G25: true })).toBe('ēgapēsen,')
    expect(display(v, { G25: 'agape' })).toBe(v.text)
    for (const change of [
      { strongs: 'G26' }, { language: 'Hebrew' as const }, { text: 'ἠγάxπησεν' },
      { translit: 'ēgapēsen-' }, { rowId: '' }, { book: 'Prov' }, { chapter: 24 },
      { evidence: 'corroborated' as const }, { morph: '' }, { morph: 'Preposition | Noun' }
    ]) {
      const dubious = verse([word(0, 'loved', ',', 'G25', { ...greek, ...change })])
      expect(display(dubious, { G25: true })).toBe(dubious.text)
    }
    expect(display(v, { G25: true }, { ...ref, translation: 'WEB' })).toBe(v.text)
    const phrase = verse([word(0, 'You have loved', '', 'G25', { ...greek, english: 'You have loved' })])
    expect(display(phrase, { G25: true })).toBe(phrase.text)
  })
  it('keeps words with uncertain evidence exactly as printed', () => {
    for (const change of [
      { text: 'אֲדֹנָי' }, { text: 'לַיהוָה' }, { text: 'יָהּ' }, { english: 'your LORD' },
      { language: 'Greek' as const }, { verse: 2 }, { startPosition: -1 }, { endPosition: 1 }
    ]) {
      const v = verse([word(0, 'The LORD', ',', 'H3068', { ...source, ...change })])
      expect(display(v)).toBe(v.text)
    }
    const inferred = verse([{ ...word(0, 'The LORD', '.', 'H3068', source), derived: true }])
    expect(display(inferred)).toBe(inferred.text)
    const unverified = verse([word(0, 'God', '.', 'H430')])
    expect(display(unverified, { H430: true })).toBe(unverified.text)
  })
  it('uses printed text if a tagger changes words or punctuation', () => {
    const bad = { ...verse([word(0, 'The LORD', '', 'H3068', source)]), text: 'The LORD!' }
    expect(restoredVerseSegments(bad, ref, true)).toEqual([{ display: bad.text, original: bad.text }])
  })

  it('preserves both translated phrases and adds the written form from each distinct G264 row', () => {
    const where = { book: '1John', chapter: 2, translation: 'BSB' }
    const sin = { ...source, ...where, language: 'Greek' as const, strongs: 'G264', morph: 'Verb',
      rowId: '199485', english: 'you will not sin', text: 'ἁμάρτητε', translit: 'hamartēte' }
    const other = { ...sin, rowId: '199489', startPosition: 1, endPosition: 1,
      english: 'does sin', text: 'ἁμάρτῃ', translit: 'hamartē' }
    const v = verse([word(0, sin.english, ', ', 'G264', sin), word(1, other.english, '.', 'G264', other)])
    const parts = restoredVerseSegments(v, where, true, {}, ['G264'])
    expect(parts.map(p => p.display).join('')).toBe(v.text)
    expect(parts.filter(p => p.annotation).map(p => [p.display, p.annotation])).toEqual([
      ['you will not sin', sin.text], ['does sin', other.text]
    ])
    const split = literaryGroups(parts, [{ at: 4, kind: 'poetry', indent: 1 }], true, false)
    expect(split.flatMap(g => g.parts).filter(p => p.annotation).map(p => p.annotation)).toEqual([sin.text, other.text])
    expect(restoredVerseSegments(v, where, false, {}, ['G264']).every(p => !p.annotation)).toBe(true)
    for (const edition of ['KJV', 'WEB', 'imp_example']) {
      expect(restoredVerseSegments(v, { ...where, translation: edition }, true, {}, ['G264']).every(p => !p.annotation)).toBe(true)
    }
  })

  it('requires independent evidence before directly displaying the written form and keeps YHWH fixed', () => {
    const greek = { ...source, language: 'Greek' as const, strongs: 'G1410', english: 'cannot',
      text: 'δύναται', translit: 'dynatai', morph: 'Verb' }
    const resolve = (s: SourceWord) => restoredVerseSegments(verse([word(0, s.english, '.', s.strongs, s)]),
      ref, true, {}, [s.strongs])[0]
    expect(resolve(greek)).toMatchObject({ display: 'cannot', annotation: 'δύναται' })
    expect(resolve({ ...greek, english: 'can', canReplaceAlone: true })).toMatchObject({ display: 'δύναται', original: 'can' })
    expect(resolve({ ...greek, english: 'can', canReplaceAlone: true, morph: 'Verb | Particle' }).annotation).toBe('δύναται')
    expect(resolve({ ...greek, english: 'we can', canReplaceAlone: true }).display).toBe('we can')
    expect(resolve({ ...source, strongs: 'H430', english: 'God', text: 'אֱלֹהִים', translit: 'elohim' }).display).toBe('אֱלֹהִים')
    expect(resolve(source).display).toBe('YHWH')
    const affixed = resolve({ ...source, text: 'לַיהוָה', canReplaceAlone: true })
    expect(affixed.display).toBe('The LORD')
    expect(affixed.annotation).toBeUndefined()
    expect(resolve({ ...greek, chapter: 29 })).not.toHaveProperty('annotation')
  })
})
