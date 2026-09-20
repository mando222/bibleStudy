import { foldLatinHomoglyphs } from '../src/shared/originalText'
// One splitter, shared with the main process — see src/shared/verseUnits.ts for why.
export { normSurface, splitVerseUnits } from '../src/shared/verseUnits'
import { normSurface, splitVerseUnits } from '../src/shared/verseUnits'

// Pure text-processing helpers for the build pipeline — extracted so they can be unit-tested
// independently (a bad transliteration/normalisation/sanitiser would silently corrupt the DB).

/** Normalise an extended Strong's ("H0430G", "{H1254A}", "G1722") → "H430" / "G1722", or null. */
export function normStrongs(raw: string): string | null {
  const m = /([GH])0*(\d+)/.exec(raw)
  return m ? `${m[1]}${m[2]}` : null
}

/** Normalise a Greek word for matching: NFD, drop diacritics/punctuation, lower-case, final-σ. */
export function normGreek(s: string): string {
  return foldLatinHomoglyphs(s)
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

// ---- verse-token reconciliation --------------------------------------------
// The word-level Strong's sources are third-party and imperfect: kaiserlik/kjv truncates the tail
// of ~3k verses and carries Psalm superscriptions ("[[Shiggaion of David…]]") and footnote markers
// ("Amen.[fn"); bereanbible's table carries alignment markup ("[the]", "{}", ". . ."). The reader
// renders from these tokens whenever Strong's numbers or Quick Replace are on, so those artifacts
// used to leak into (and truncate) the visible Scripture text.
//
// `retileTokens` makes `verses.text` authoritative: the tokens are re-tiled onto the real words of
// the verse, so `concat(surface + trailer) === text` exactly, while Strong's/lemma/morph metadata
// is carried across by an LCS word alignment. Words the tagger missed become untagged tokens
// (still readable, just not clickable); tagger words that aren't in the verse are dropped.

export interface RawToken {
  surface: string
  trailer: string
  strongs: string | null
  lemma?: string | null
  translit?: string | null
  morph?: string | null
  gloss?: string | null
}

/** The comparable words a tagger token contributes (alignment markup stripped). */
function tokenWords(surface: string): string[] {
  return surface
    .replace(/[[\]{}]/g, ' ')
    .split(/\s+/)
    .map(normSurface)
    .filter(Boolean)
}

/**
 * Re-tile `tokens` onto the authoritative `text`. The result always reconstructs `text` exactly;
 * metadata follows the longest common subsequence of normalised words, so a multi-word tagger
 * token ("went up", "[the] beginning") stays a single token when its words are adjacent.
 */
export function retileTokens(text: string, tokens: RawToken[]): RawToken[] {
  const units = splitVerseUnits(text)
  if (!units.length) return []
  const unitKeys = units.map((u) => normSurface(u.surface))

  // Flatten tagger words, remembering which token each came from.
  const words: string[] = []
  const owners: number[] = []
  tokens.forEach((t, i) => {
    for (const w of tokenWords(t.surface)) {
      words.push(w)
      owners.push(i)
    }
  })

  // LCS alignment: unit index → source token index (-1 = untagged).
  const n = unitKeys.length
  const m = words.length
  const owner = new Array<number>(n).fill(-1)
  if (m > 0) {
    const w = m + 1
    const dp = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] =
          unitKeys[i] !== '' && unitKeys[i] === words[j]
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (unitKeys[i] !== '' && unitKeys[i] === words[j]) {
        owner[i] = owners[j]
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
      else j++
    }
  }

  // Emit one output token per run of consecutive units sharing a source token.
  const out: RawToken[] = []
  let i = 0
  while (i < n) {
    const o = owner[i]
    let j = i + 1
    if (o >= 0) while (j < n && owner[j] === o) j++
    let surface = ''
    for (let k = i; k < j; k++) surface += k === j - 1 ? units[k].surface : units[k].surface + units[k].trailer
    const src = o >= 0 ? tokens[o] : null
    out.push({
      surface,
      trailer: units[j - 1].trailer,
      strongs: src?.strongs ?? null,
      lemma: src?.lemma ?? null,
      translit: src?.translit ?? null,
      morph: src?.morph ?? null,
      gloss: src?.gloss ?? null
    })
    i = j
  }
  return out
}

// ---- derived word→Strong's mapping ------------------------------------------
// Only two of the bundled translations carry scholarly word tagging (KJV, BSB). For the rest,
// every word is dead: no lexicon on click, no Quick Replace, no concordance, no word-level
// interlinear alignment.
//
// These functions INFER a mapping. They are not scholarship, and the results are stored apart
// from the tagged data and surfaced as inferred — see `derived_tags` in schema.sql. Measured at
// roughly 92% agreement against the KJV's independent tagging, which the method never sees.
//
// Two passes per verse:
//   1. Align the verse's words to the BSB's for the same verse and carry its tag across. The BSB
//      is 99% tagged and aligned to the originals, and an English↔English alignment is a far
//      easier problem than English↔Greek. LCS keeps it occurrence-aware, so the 4th "the" maps to
//      the 4th "the".
//   2. For words the BSB renders differently ("charity"/love, "worlde"/world), restrict candidates
//      to the Strong's numbers THAT VERSE actually contains — usually 15–25 — and match a stemmed
//      form against surfaces attested elsewhere. A hit in so small a pool is rarely ambiguous.

/** Comparison key for an English word: letters and digits, lower-cased. */
export function wordKey(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Crude English stemmer — enough to bridge loveth/loved/love and worlde/world. */
export function stemWord(w: string): string {
  for (const suf of ['eth', 'est', 'ing', 'edst', 'ed', 'es', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w.length > 4 && w.endsWith('e') ? w.slice(0, -1) : w
}

export interface PivotWord {
  key: string
  strongs: string | null
}

/**
 * Infer one Strong's number (or null) per word of a verse. `words` must be the verse's
 * whitespace-split chunks in order — one output entry per input, so the result stays positional.
 */
export function deriveVerseTags(
  words: string[],
  pivot: PivotWord[],
  candidates: ReadonlySet<string>,
  attested: ReadonlyMap<string, ReadonlySet<string>>
): (string | null)[] {
  const keys = words.map(wordKey)
  const out: (string | null)[] = new Array(words.length).fill(null)

  // Pass 1 — LCS alignment against the pivot translation.
  const n = keys.length
  const m = pivot.length
  if (n > 0 && m > 0) {
    const w = m + 1
    const dp = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] =
          keys[i] !== '' && keys[i] === pivot[j].key
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (keys[i] !== '' && keys[i] === pivot[j].key) {
        out[i] = pivot[j].strongs
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
      else j++
    }
  }

  // Pass 2 — unambiguous match inside this verse's own Strong's set.
  for (let i = 0; i < n; i++) {
    if (out[i] || !keys[i]) continue
    const stem = stemWord(keys[i])
    let hit: string | null = null
    for (const s of candidates) {
      if (!attested.get(s)?.has(stem)) continue
      if (hit) {
        hit = null // ambiguous — leave the word untagged rather than guess
        break
      }
      hit = s
    }
    out[i] = hit
  }
  return out
}

/** Pack per-word tags into one compact string per verse ('-' = no tag). */
export function packTags(tags: (string | null)[]): string {
  return tags.map((t) => t ?? '-').join(' ')
}

/** Unpack a stored row back into per-word tags. */
export function unpackTags(packed: string): (string | null)[] {
  return packed.split(' ').map((t) => (t === '-' ? null : t))
}
