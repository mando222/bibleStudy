import { describe, it, expect } from 'vitest'
import {
  applyQuickReplace,
  quickReplaceApplies,
  renderQuickReplace,
  computeQuickReplacements,
  QUICK_REPLACE_LIST,
  type QuickReplaceToken
} from '../src/shared/quickReplace'

/** What the reader actually shows for one token. */
const show = (strongs: string, surface: string, repl: string): string => {
  const p = applyQuickReplace(strongs, surface, repl)
  return p.before + p.replaced + p.after
}

/** Render a whole verse the way VerseView does, with Quick Replace defaults on. */
const verse = (toks: QuickReplaceToken[]): string => {
  const on = computeQuickReplacements(true, {})
  return renderQuickReplace(toks, (t) => {
    const r = t.strongs ? on[t.strongs] : undefined
    if (!r || !quickReplaceApplies(t.strongs!, t.surface)) return undefined
    return applyQuickReplace(t.strongs!, t.surface, r)
  })
    .map((r) => (r.part ? r.part.before + r.part.replaced + r.part.after : r.tail) + r.trailer)
    .join('')
}

describe('Quick Replace keeps the words around the name', () => {
  // A tagged translation maps a whole English phrase to one original word, so replacing the
  // entire surface used to delete the preposition: "the Day of Yahweh" became "the Day Yahweh".
  it('preserves a preposition the name’s token happens to carry', () => {
    expect(show('H3068', 'of the LORD', 'Yahweh')).toBe('of Yahweh')
    expect(show('H3068', 'to the LORD', 'Yahweh')).toBe('to Yahweh')
    expect(show('H3068', 'am the LORD', 'Yahweh')).toBe('am Yahweh')
    expect(show('H3068', 'Then the LORD', 'Yahweh')).toBe('Then Yahweh')
    expect(show('H3068', 'O LORD', 'Yahweh')).toBe('O Yahweh')
  })

  it('keeps a possessive attached to the name', () => {
    expect(show('H3068', 'the LORD’s', 'Yahweh')).toBe('Yahweh’s')
  })

  // יהוה is parsed Npt — a proper noun, which Hebrew never articles — so "the" translates nothing.
  it('drops the article before a proper name, but not before a title', () => {
    expect(show('H3068', 'the LORD', 'Yahweh')).toBe('Yahweh')
    expect(show('H136', 'the Lord', 'Adonai')).toBe('Adonai')
    // אֱלֹהִים *is* articled in Hebrew (הָאֱלֹהִים), so H430 keeps its "the".
    expect(show('H430', 'the God', 'Elohim')).toBe('the Elohim')
    expect(show('H430', 'of God', 'Elohim')).toBe('of Elohim')
    expect(show('H430', 'your God', 'Elohim')).toBe('your Elohim')
  })

  it('does not mistake a word ending in “the” for an article', () => {
    expect(show('H3068', 'breathe the LORD', 'Yahweh')).toBe('breathe Yahweh')
    expect(show('H3068', 'loathe LORD', 'Yahweh')).toBe('loathe Yahweh')
  })

  it('falls back to replacing the whole surface when the word can’t be located', () => {
    // Nothing in the surface matches the entry, so the prior behaviour stands rather than
    // silently skipping a substitution that used to happen.
    expect(show('G26', 'charity', 'agape')).toBe('agape')
  })

  it('still refuses senses the entry isn’t about', () => {
    // H5945 is both the divine title "Most High" and the ordinary adjective "upper".
    expect(quickReplaceApplies('H5945', 'the upper chamber')).toBe(false)
    expect(quickReplaceApplies('H5945', 'the Most High')).toBe(true)
  })
})

describe('Quick Replace across token boundaries', () => {
  // A word-tokenised translation (KJV) keeps "the" in its own token, so the article that has to
  // go sits in the PREVIOUS token. Without this the KJV read "the day of the Yahweh".
  it('drops an article that lives in the previous token', () => {
    expect(
      verse([
        { strongs: null, surface: 'of', trailer: ' ' },
        { strongs: null, surface: 'the', trailer: ' ' },
        { strongs: 'H3068', surface: 'LORD', trailer: '' }
      ])
    ).toBe('of Yahweh')
  })

  it('leaves the article alone before a title', () => {
    expect(
      verse([
        { strongs: null, surface: 'the', trailer: ' ' },
        { strongs: 'H430', surface: 'God', trailer: '' }
      ])
    ).toBe('the Elohim')
  })

  it('does not reach past punctuation', () => {
    expect(
      verse([
        { strongs: null, surface: 'said', trailer: ', ' },
        { strongs: 'H3068', surface: 'LORD', trailer: '' }
      ])
    ).toBe('said, Yahweh')
  })
})

describe('Quick Replace spacing', () => {
  it('keeps the separator that was actually there, inventing none', () => {
    // An opening quote is not followed by a space, so neither is the name that replaces the
    // article after it — this printed “ Yahweh.
    expect(show('H3068', '“The LORD', 'Yahweh')).toBe('“Yahweh')
    expect(show('H3068', '(The LORD', 'Yahweh')).toBe('(Yahweh')
    expect(show('H3068', 'of the LORD', 'Yahweh')).toBe('of Yahweh')
  })

  it('drops the space after a bracket left alone by the strip', () => {
    expect(
      verse([
        { strongs: null, surface: '(The', trailer: ' ' },
        { strongs: 'H3068', surface: 'LORD', trailer: '' }
      ])
    ).toBe('(Yahweh')
  })

  it('does not trim a neighbour when this surface already held the article', () => {
    // The Geneva Bible spells "them" as "the", so reaching into the previous token after already
    // stripping an article turned "say vnto the, The Lord" into "say vnto , Yahweh".
    expect(
      verse([
        { strongs: null, surface: 'the', trailer: ', ' },
        { strongs: 'H3068', surface: 'The Lord', trailer: '' }
      ])
    ).toBe('the, Yahweh')
  })
})

describe('Quick Replace entry data', () => {
  it('every proper name declares the forms needed to locate it', () => {
    for (const i of QUICK_REPLACE_LIST.filter((x) => x.properName)) {
      expect(i.forms?.length ?? i.traditional.length, i.strongs).toBeTruthy()
    }
  })
})
