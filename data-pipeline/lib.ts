// Pure text-processing helpers for the build pipeline — extracted so they can be unit-tested
// independently (a bad transliteration/normalisation/sanitiser would silently corrupt the DB).

/** Normalise an extended Strong's ("H0430G", "{H1254A}", "G1722") → "H430" / "G1722", or null. */
export function normStrongs(raw: string): string | null {
  const m = /([GH])0*(\d+)/.exec(raw)
  return m ? `${m[1]}${m[2]}` : null
}

/** Normalise a Greek word for matching: NFD, drop diacritics/punctuation, lower-case, final-σ. */
export function normGreek(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^α-ω]/g, '')
    .replace(/ς/g, 'σ')
}

/** Normalise a Hebrew word: drop cantillation + vowel points, keep consonants. */
export function normHebrew(s: string): string {
  return s.normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '')
}

const GK: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō'
}

/** Greek → Latin (SBL-style) transliteration. Deterministic study aid, not accent-perfect. */
export function translitGreek(word: string): string | null {
  const clusters: { base: string; marks: string }[] = []
  for (const ch of word.normalize('NFD')) {
    if (/[̀-ͯ]/.test(ch)) {
      if (clusters.length) clusters[clusters.length - 1].marks += ch
    } else clusters.push({ base: ch, marks: '' })
  }
  const lc = (c: string): string => (c || '').toLowerCase()
  const first = clusters.findIndex((c) => /\p{L}/u.test(c.base))
  // Rough breathing (U+0314) on the first vowel (or the 2nd of an initial diphthong) → aspiration.
  const rough =
    first >= 0 &&
    (clusters[first]?.marks.includes('̔') || clusters[first + 1]?.marks.includes('̔'))
  let out = ''
  for (let i = 0; i < clusters.length; i++) {
    const b = lc(clusters[i].base)
    if (!(b in GK)) continue
    if (b === 'ρ' && i === first && rough) {
      out += 'rh'
      continue
    }
    if (b === 'γ') {
      const n = lc(clusters[i + 1]?.base ?? '')
      if (n === 'γ' || n === 'κ' || n === 'ξ' || n === 'χ') {
        out += 'n'
        continue
      }
    }
    if (b === 'υ') {
      const p = lc(clusters[i - 1]?.base ?? '')
      if (p === 'α' || p === 'ε' || p === 'η' || p === 'ο') {
        out += 'u'
        continue
      }
    }
    out += GK[b]
  }
  if (rough && lc(clusters[first]?.base ?? '') !== 'ρ') out = 'h' + out
  return out || null
}

/** Sanitise a STEPBible lexicon body to a safe subset: only <b>/<i> tags + newlines. */
export function cleanLexBody(html: string): string {
  let s = html
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<ref\b[^>]*>(.*?)<\/ref>/gi, '$1')
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
  s = s.replace(/<b\b[^>]*>/gi, '<b>').replace(/<i\b[^>]*>/gi, '<i>')
  s = s.replace(/<(?!\/?[bi]>)[^>]*>/g, '')
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}
