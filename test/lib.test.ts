import { describe, it, expect } from 'vitest'
import { normStrongs, normGreek, normHebrew, translitGreek, cleanLexBody } from '../data-pipeline/lib'

describe('normStrongs', () => {
  it('strips leading zeros and trailing letters', () => {
    expect(normStrongs('G0026')).toBe('G26')
    expect(normStrongs('H0430G')).toBe('H430')
    expect(normStrongs('{H1254A}')).toBe('H1254')
    expect(normStrongs('G1722')).toBe('G1722')
  })
  it('returns null when there is no Strong number', () => {
    expect(normStrongs('')).toBeNull()
    expect(normStrongs('—')).toBeNull()
  })
})

describe('normGreek (accent/case-insensitive matching)', () => {
  it('collapses accent + case + final sigma so grave/acute variants match', () => {
    expect(normGreek('θεός')).toBe(normGreek('θεὸς')) // acute vs grave (positional)
    expect(normGreek('ΛΟΓΟΣ')).toBe(normGreek('λόγος')) // case + final sigma
    expect(normGreek('θεός')).toBe('θεοσ')
  })
  it('drops punctuation attached to a word', () => {
    expect(normGreek('γῆν.')).toBe('γην')
  })
})

describe('normHebrew (consonantal skeleton)', () => {
  it('drops vowel points + cantillation, keeps consonants', () => {
    expect(normHebrew('אֱלֹהִים')).toBe('אלהים')
    expect(normHebrew('בְּרֵאשִׁ֖ית')).toBe('בראשית')
  })
})

describe('translitGreek', () => {
  it('handles the core cases: eta, omega, breathing, diphthongs, gamma-nasal', () => {
    expect(translitGreek('θεός')).toBe('theos')
    expect(translitGreek('ὁ')).toBe('ho') // rough breathing → h
    expect(translitGreek('λόγος')).toBe('logos')
    expect(translitGreek('οὐρανόν')).toBe('ouranon') // ου diphthong → ou
    expect(translitGreek('ἀρχή')).toBe('archē') // eta → ē
    expect(translitGreek('ἄγγελος')).toBe('angelos') // γγ → ng
  })
  it('returns null for empty / non-Greek input', () => {
    expect(translitGreek('')).toBeNull()
    expect(translitGreek('123')).toBeNull()
  })
})

describe('cleanLexBody (lexicon HTML sanitiser)', () => {
  it('keeps only <b>/<i> and newlines, dropping every other tag + attributes', () => {
    const out = cleanLexBody('<b>ἀγάπη</b><br /><i>love</i> <ref="Luk.4.34">Luke 4:34</ref>')
    expect(out).toBe('<b>ἀγάπη</b>\n<i>love</i> Luke 4:34')
  })
  it('strips javascript anchors but keeps their visible text', () => {
    expect(cleanLexBody('grace <a href="javascript:void(0)" title="x">Refs</a>')).toBe('grace Refs')
  })
  it('removes tag attributes (no XSS surface survives)', () => {
    const out = cleanLexBody('<b onclick="steal()">x</b><script>bad()</script>')
    expect(out).toBe('<b>x</b>bad()') // <b> attrs stripped; <script> tag removed, text remains
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('<script')
  })
})
