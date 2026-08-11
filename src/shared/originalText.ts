// Swete's Septuagint (our LXX edition) is a transcription of a 1900s printed edition, and it
// carries two OCR-era artifacts inside otherwise-Greek words:
//   • visually identical Latin letters substituted for Greek ones — "Iσραὴλ", "Aἰλὰμ", "Nόομ",
//     "KAI" — which look right on screen but are a different string entirely;
//   • Roman-numeral section markers from the printed page, sometimes fused onto the next word
//     ("VIἔτει", "XVαβὰθ", "XXIIIἐπέστρεψαν").
//
// Both make ~375 LXX words unfindable: every lookup path folds with `[^α-ω]` filters, which
// silently drop the Latin letter and change the word.
//
// This folding is applied ONLY to search/lookup keys, never to the stored or displayed text. The
// printed edition is the authority for what the text says; repairing it would mean guessing.

/** Latin → Greek for glyph pairs that are visually identical, so a substitution is unambiguous. */
const LATIN_TO_GREEK: Record<string, string> = {
  A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ',
  N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', Y: 'Υ', X: 'Χ',
  o: 'ο',
  l: 'ι' // stands in for capital Iota in this transcription ("lσραὴλ")
}

const GREEK_CHAR = '[\\u0370-\\u03FF\\u1F00-\\u1FFF]'
// A multi-letter numeral, or one of V/L/C/D which have no Greek look-alike, immediately before a
// Greek letter is a section marker rather than part of the word.
const MARKER_PREFIX = new RegExp(`^(?:[IVXLCDM]{2,}|[VLCD])(?=${GREEK_CHAR})`)

/** Normalise the Latin-glyph artifacts above so an LXX word folds to the key readers expect. */
export function foldLatinHomoglyphs(s: string): string {
  return s
    .replace(MARKER_PREFIX, '')
    .replace(/[ABEZHIKMNOPTYXol]/g, (c) => LATIN_TO_GREEK[c] ?? c)
}
