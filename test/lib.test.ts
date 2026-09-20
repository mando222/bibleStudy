import { describe, it, expect } from 'vitest'
import {
  normStrongs,
  normGreek,
  normHebrew,
  translitGreek,
  cleanLexBody,
  splitVerseUnits,
  retileTokens,
  type RawToken,
  deriveVerseTags,
  packTags,
  unpackTags,
  stemWord,
  wordKey,
  type PivotWord
} from '../data-pipeline/lib'
import { foldLatinHomoglyphs } from '../src/shared/originalText'

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

describe('splitVerseUnits', () => {
  it('re-concatenates to exactly the original text', () => {
    for (const t of [
      'In the beginning was the Word, and the Word was God.',
      'O LORD my God, in thee do I put my trust: save me from all them that persecute me, and deliver me:',
      '“Truly,” he said — “amen!”'
    ]) {
      expect(splitVerseUnits(t).map((u) => u.surface + u.trailer).join('')).toBe(t)
    }
  })
  it('puts the word in surface and its punctuation + space in trailer', () => {
    expect(splitVerseUnits('of prayer, being')).toEqual([
      { surface: 'of', trailer: ' ' },
      { surface: 'prayer', trailer: ', ' },
      { surface: 'being', trailer: '' }
    ])
  })
})

describe('retileTokens', () => {
  const tok = (surface: string, strongs: string | null = null): RawToken => ({
    surface,
    trailer: ' ',
    strongs
  })
  const render = (ts: RawToken[]): string => ts.map((t) => t.surface + t.trailer).join('')

  it('restores the tail the KJV tagger truncated (Acts 3:1)', () => {
    // kaiserlik/kjv genuinely ends this verse at "the ninth" — "hour." is missing upstream.
    const text = 'Now Peter and John went up together into the temple at the hour of prayer, being the ninth hour.'
    const out = retileTokens(text, [
      tok('Now', 'G1161'), tok('Peter', 'G4074'), tok('and', 'G2532'), tok('John', 'G2491'),
      tok('went up', 'G305'), tok('together', 'G1909'), tok('into', 'G1519'), tok('the temple', 'G2411'),
      tok('at the hour', 'G5610'), tok('of prayer,', 'G4335'), tok('being'), tok('the'), tok('ninth')
    ])
    expect(render(out)).toBe(text)
    expect(out[out.length - 1].surface).toBe('hour')
    expect(out[out.length - 1].strongs).toBeNull() // present and readable, just untagged
  })

  it('keeps multi-word tagger tokens together', () => {
    const out = retileTokens('Now Peter went up together', [
      tok('Now', 'G1161'), tok('Peter', 'G4074'), tok('went up', 'G305'), tok('together', 'G1909')
    ])
    expect(out.map((t) => t.surface)).toEqual(['Now', 'Peter', 'went up', 'together'])
    expect(out[2].strongs).toBe('G305')
  })

  it('drops a Psalm superscription the tagger prepends (Ps 7:1)', () => {
    const text = 'O LORD my God, in thee do I put my trust: save me from all them that persecute me, and deliver me:'
    const out = retileTokens(text, [
      tok('[[Shiggaion'), tok('of'), tok('David,'), tok('which'), tok('he'), tok('sang'),
      tok('unto'), tok('the'), tok('LORD,', 'H3068'), tok('concerning'), tok('the'), tok('words'),
      tok('of'), tok('Cush'), tok('the'), tok('Benjamite.]]'),
      tok('O'), tok('LORD', 'H3068'), tok('my'), tok('God,', 'H430'), tok('in'), tok('thee'),
      tok('do'), tok('I'), tok('put'), tok('my'), tok('trust:', 'H2620'), tok('save', 'H3467'),
      tok('me'), tok('from'), tok('all'), tok('them'), tok('that'), tok('persecute', 'H7291'),
      tok('me'), tok('and'), tok('deliver', 'H5337')
    ])
    expect(render(out)).toBe(text)
    expect(render(out)).not.toContain('Shiggaion')
    expect(render(out)).not.toContain('[[')
    expect(out[out.length - 1].surface).toBe('me') // the truncated tail is back
  })

  it('strips BSB alignment markup and placeholder tokens', () => {
    const text = 'Through Him all things were made, and without Him nothing was made that has been made.'
    const out = retileTokens(text, [
      tok('Through', 'G1223'), tok('Him', 'G846'), tok('all things', 'G3956'), tok('were made', 'G1096'),
      tok('and', 'G2532'), tok('without', 'G5565'), tok('Him', 'G846'), tok('nothing', 'G3761'),
      tok('. . .', 'G1520'), tok('was made', 'G1096'), tok('that', 'G3739'), tok('has been made', 'G1096')
    ])
    expect(render(out)).toBe(text)
    expect(render(out)).not.toContain('. . .')
  })

  it('removes bracket markup from a supplied-word token but keeps its Strong’s', () => {
    const out = retileTokens('In the beginning was the Word', [
      tok('In', 'G1722'), tok('[the] beginning', 'G746'), tok('was', 'G1510'),
      tok('the', 'G3588'), tok('Word', 'G3056')
    ])
    expect(render(out)).toBe('In the beginning was the Word')
    expect(out[1]).toMatchObject({ surface: 'the beginning', strongs: 'G746' })
  })

  it('never invents or loses text, whatever the tagger says', () => {
    const text = 'And he said unto them, Follow me.'
    expect(render(retileTokens(text, []))).toBe(text)
    expect(render(retileTokens(text, [tok('completely'), tok('unrelated')]))).toBe(text)
  })
})

describe('foldLatinHomoglyphs (Swete LXX transcription artifacts)', () => {
  it('maps Latin look-alike letters onto their Greek counterparts', () => {
    // "Iσραὴλ" starts with a LATIN I; every lookup path strips non-Greek, which used to turn it
    // into "σραηλ" and make the word unfindable.
    expect(normGreek('Iσραὴλ')).toBe(normGreek('Ἰσραὴλ'))
    expect(normGreek('Aἰλὰμ')).toBe(normGreek('Αἰλὰμ'))
    expect(normGreek('Nόομ')).toBe(normGreek('Νόομ'))
    expect(normGreek('Bουκείας')).toBe(normGreek('Βουκείας'))
    expect(normGreek('KAI')).toBe(normGreek('καί'))
  })
  it('drops printed-page Roman-numeral section markers fused onto a word', () => {
    expect(normGreek('VIἔτει')).toBe(normGreek('ἔτει'))
    expect(normGreek('XVαβὰθ')).toBe(normGreek('αβὰθ'))
    expect(normGreek('Vχρίσαι')).toBe(normGreek('χρίσαι'))
    expect(normGreek('XXIIIἐπέστρεψαν')).toBe(normGreek('ἐπέστρεψαν'))
  })
  it('leaves ordinary Greek untouched', () => {
    for (const w of ['θεός', 'ἀγάπη', 'λόγος', 'Ἰησοῦς', 'ἐν']) {
      expect(foldLatinHomoglyphs(w)).toBe(w)
    }
  })
})

describe('derived word tags', () => {
  // Each entry is [word, strongs, sourceTokenIndex]. Words sharing a token index came from one
  // multi-word Berean token, e.g. "of the LORD".
  const pivot = (triples: [string, string | null, number][]): PivotWord[] =>
    triples.map(([w, s, tok]) => ({ key: wordKey(w), strongs: s, token: tok }))
  const strongsOf = (tags: { strongs: string | null }[]): (string | null)[] => tags.map((x) => x.strongs)

  it('carries tags across from the pivot translation, occurrence-aware', () => {
    // "the" appears twice and must map to the RIGHT occurrence, not the first.
    const got = deriveVerseTags(
      ['In', 'the', 'beginning', 'was', 'the', 'Word'],
      pivot([['In', 'G1722', 0], ['the', 'G3588', 1], ['beginning', 'G746', 2], ['was', 'G1510', 3], ['the', 'G3739', 4], ['Word', 'G3056', 5]]),
      new Set(),
      new Map()
    )
    expect(strongsOf(got)).toEqual(['G1722', 'G3588', 'G746', 'G1510', 'G3739', 'G3056'])
    expect(got.every((x) => !x.continues)).toBe(true) // every pivot word was its own token
  })

  it('returns one entry per word, including punctuation-only chunks', () => {
    const got = deriveVerseTags(['God', '—', 'love'], pivot([['God', 'H430', 0]]), new Set(), new Map())
    expect(got).toHaveLength(3)
    expect(got[0].strongs).toBe('H430')
    expect(got[1].strongs).toBeNull()
  })

  it('falls back to the verse\'s own Strong\'s set when the pivot words differ', () => {
    // The pivot says "love"; this translation says "charity". Both are attested for G26, and G26
    // is one of the numbers this verse actually contains — so it resolves.
    const got = deriveVerseTags(
      ['charity'],
      pivot([['love', 'G26', 0]]),
      new Set(['G26', 'G1722']),
      new Map([['G26', new Set([stemWord(wordKey('charity')), 'love'])]])
    )
    expect(strongsOf(got)).toEqual(['G26'])
    expect(got[0].continues).toBe(false) // a tier-2 match never continues a phrase
  })

  it('refuses to guess when two candidates both match', () => {
    const got = deriveVerseTags(
      ['love'],
      [],
      new Set(['G25', 'G26']),
      new Map([['G25', new Set(['love'])], ['G26', new Set(['love'])]])
    )
    expect(strongsOf(got)).toEqual([null]) // ambiguous -> untagged, never a coin flip
  })

  it('bridges inflection and archaic spelling via the stemmer', () => {
    expect(stemWord(wordKey('loveth'))).toBe(stemWord(wordKey('loved')))
    expect(stemWord(wordKey('worlde'))).toBe(stemWord(wordKey('world')))
  })

  it('keeps a multi-word source token as ONE token', () => {
    // The Berean tags "of the LORD" as a single token carrying H3068. Marking the continuation is
    // what stops Quick Replace rendering "Yahweh Yahweh Yahweh" — the 0.2.3 regression.
    const got = deriveVerseTags(
      ['of', 'the', 'LORD', 'came'],
      pivot([['of', 'H3068', 7], ['the', 'H3068', 7], ['LORD', 'H3068', 7], ['came', 'H1961', 8]]),
      new Set(),
      new Map()
    )
    expect(strongsOf(got)).toEqual(['H3068', 'H3068', 'H3068', 'H1961'])
    expect(got.map((x) => x.continues)).toEqual([false, true, true, false])
  })

  it('keeps two genuine adjacent occurrences as TWO tokens', () => {
    // "LORD, LORD" (Exod 34:6) is two separate Hebrew words. Merging on matching Strong's alone
    // would collapse them and silently drop one.
    const got = deriveVerseTags(
      ['LORD', 'LORD'],
      pivot([['LORD', 'H3068', 3], ['LORD', 'H3068', 4]]),
      new Set(),
      new Map()
    )
    expect(got.map((x) => x.continues)).toEqual([false, false])
  })

  it('merges a fallback match into the neighbouring phrase it belongs to', () => {
    // The Berean tags "of the LORD" as one token. In Young's the verse reads "of Jehovah": "of"
    // aligns to that token, but "Jehovah" doesn't match "LORD" and is tagged by the fallback pass.
    // Both render the SAME Hebrew word, so they must be one token — this was the 0.2.3 bug.
    const got = deriveVerseTags(
      ['word', 'of', 'Jehovah', 'unto'],
      pivot([['word', 'H1697', 0], ['of', 'H3068', 1], ['the', 'H3068', 1], ['lord', 'H3068', 1]]),
      new Set(['H3068']),
      new Map([['H3068', new Set(['jehovah'])]])
    )
    expect(strongsOf(got)).toEqual(['H1697', 'H3068', 'H3068', null])
    expect(got.map((x) => x.continues)).toEqual([false, false, true, false])
  })

  it('packs and unpacks losslessly, marking untagged words and continuations', () => {
    const tags = [
      { strongs: 'H3068', continues: false },
      { strongs: 'H3068', continues: true },
      { strongs: null, continues: false },
      { strongs: 'G26', continues: false }
    ]
    expect(packTags(tags)).toBe('H3068 + - G26')
    expect(unpackTags(packTags(tags))).toEqual(tags)
  })
})
