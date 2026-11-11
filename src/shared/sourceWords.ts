import type { ChapterRef, SourceWord, Verse, VerseToken } from './types'

/** First bundled alignment that verifies lexical spans and independent KJV witnesses. */
export const SOURCE_WORD_ALIGNMENT_VERSION = '1'

/** These English forms identify a term in the published text. They never supply its display spelling. */
interface SourceWordTerm {
  label: string
  ids: string[]
  english: RegExp
  defaultOn?: boolean
}

export const SOURCE_WORD_TERMS: SourceWordTerm[] = [
  { label: 'Divine name (YHWH)', ids: ['H3068', 'H3069'], english: /^(?:(?:The|the) )?(?:LORD|GOD|Jehovah|YHWH)$/, defaultOn: true },
  { label: 'Short divine name (Yah)', ids: ['H3050'], english: /^(?:(?:The|the) LORD|LORD|JAH|Jah|Yah)$/ },
  { label: 'God', ids: ['H410', 'H430', 'H433'], english: /^gods?$/i },
  { label: 'Lord', ids: ['H136', 'G2962'], english: /^lords?$/i },
  { label: 'Almighty', ids: ['H7706'], english: /^Almighty$/ },
  { label: 'Most High', ids: ['H5945'], english: /^Most High$/ },
  { label: 'Jesus / Joshua', ids: ['G2424'], english: /^(?:Jesus|Joshua)$/ },
  { label: 'Christ', ids: ['G5547'], english: /^(?:Christ|Messiah)$/ },
  { label: 'Immanuel', ids: ['G1694'], english: /^(?:Immanuel|Emmanuel)$/ },
  { label: 'Word', ids: ['G3056'], english: /^words?$/i },
  { label: 'Love', ids: ['G26', 'G25', 'G5368', 'G5373', 'H160', 'H157', 'H2617'], english: /^(?:love[ds]?|loving|beloved|friendship|lovingkindness)$/i },
  { label: 'Marriage', ids: ['G1062'], english: /^(?:marriage|wedding)s?$/i },
  { label: 'Bride', ids: ['G3565'], english: /^brides?$/i },
  { label: 'Bridegroom', ids: ['G3566'], english: /^bridegrooms?$/i },
  { label: 'Satan', ids: ['H7854', 'G4567'], english: /^Satan$/ },
  { label: 'Devil', ids: ['G1228'], english: /^devils?$/i },
  { label: 'Beelzebul', ids: ['G954'], english: /^(?:Beelzebul|Beelzebub)$/ },
  { label: 'Belial', ids: ['H1100'], english: /^Belial$/ },
  { label: 'Serpent', ids: ['H5175'], english: /^(?:serpent|snake)s?$/i },
  { label: 'Heaven', ids: ['H8064', 'G3772'], english: /^heavens?$/i },
  { label: 'Sheol', ids: ['H7585'], english: /^(?:Sheol|hell|grave)$/i },
  { label: 'Hades', ids: ['G86'], english: /^(?:Hades|hell)$/i },
  { label: 'Gehenna', ids: ['G1067'], english: /^(?:Gehenna|hell)$/i },
  { label: 'Spirit', ids: ['G4151', 'H7307'], english: /^spirits?$/i },
  { label: 'Grace', ids: ['G5485'], english: /^grace$/i },
  { label: 'Faith', ids: ['G4102'], english: /^faith$/i },
  { label: 'Peace', ids: ['H7965', 'G1515'], english: /^peace$/i },
  { label: 'Covenant', ids: ['H1285', 'G1242'], english: /^covenants?$/i },
  { label: 'Glory', ids: ['G1391', 'H3519'], english: /^glory$/i }
]

const termsById = new Map(SOURCE_WORD_TERMS.flatMap(term => term.ids.map(id => [id, term] as const)))

export type SourceWordTerms = Record<string, boolean>
export function termEnabled(id: string, settings: SourceWordTerms): boolean {
  const term = termsById.get(id)
  if (!term) return false
  return typeof settings?.[id] === 'boolean' ? settings[id] : term.defaultOn === true
}

/** One written source word. Punctuation separating words or clauses is excluded. */
export function isSourceForm(language: SourceWord['language'], text: string): boolean {
  if (language === 'Greek') return /^\p{Script=Greek}[\p{Script=Greek}\p{M}]*[᾽’']?$/u.test(text)
  return (language === 'Hebrew' || language === 'Aramaic') && /^[א-ת][א-ת\p{M}]*$/u.test(text)
}

export interface VerseSegment {
  original: string
  display: string
  /** A source word shown beside an intact English span that has no independent word boundary. */
  annotation?: string
  token?: VerseToken
}

export const isProtectedSourceName = (id: string): boolean => id === 'H3068' || id === 'H3069' || id === 'H3050'

export function presetForm(source: Pick<SourceWord, 'strongs' | 'language' | 'text' | 'translit' | 'morph'>,
  english: string): string | undefined {
  if (!termsById.get(source.strongs)?.english.test(english)) return
  // A prefix or suffix can encode a preposition, article or pronoun that English prints separately.
  if (!source.morph?.trim() || source.morph.includes('|')) return
  if (source.strongs === 'H3068' || source.strongs === 'H3069' || source.strongs === 'H3050') {
    const consonants = source.text.normalize('NFD').replace(/\p{M}/gu, '')
    if (source.language !== 'Hebrew') return
    if (source.strongs !== 'H3050') return consonants === 'יהוה' ? 'YHWH' : undefined
    if (consonants !== 'יה') return
  }
  const form = source.translit.normalize('NFC').replace(/·/g, '')
  if (/^[\p{Script=Latin}\p{M}ʾʿʼ‘’']+$/u.test(form) && /\p{Script=Latin}/u.test(form)) return form
}

/** Each displayed span carries the exact published text used by copy and citations. */
export function restoredVerseSegments(verse: Verse, ref: ChapterRef, enabled: boolean, terms: SourceWordTerms = {},
  sourceFormIds: readonly string[] = []): VerseSegment[] {
  const tokens = verse.tokens
  if (!tokens?.length || tokens.map(t => t.surface + t.trailer).join('') !== verse.text ||
      tokens.some((t, i) => t.position !== i)) {
    return [{ original: verse.text, display: verse.text }]
  }
  const replacements = new Map<number, { end: number; part: VerseSegment }>()
  const evidence = ref.translation === 'BSB' ? 'aligned' : ref.translation === 'KJV' ? 'corroborated' : undefined
  if (enabled && evidence) {
    const exactIds = new Set(sourceFormIds)
    for (let end = 0; end < tokens.length; end++) {
      const token = tokens[end]
      const source = token.sourceWord
      if (!source || token.derived || !token.strongs || !/^[GH][1-9]\d*$/.test(token.strongs) ||
          source.strongs !== token.strongs || source.edition !== 'BSB' || source.evidence !== evidence ||
          source.book !== ref.book || source.chapter !== ref.chapter || source.verse !== verse.verse ||
          !/^[1-9]\d*(?:\.\d+)?$/.test(source.rowId) || source.endPosition !== end) continue
      const exact = exactIds.has(token.strongs)
      if (!exact && !termEnabled(token.strongs, terms)) continue
      const start = source.startPosition
      if (!Number.isInteger(start) || start < 0 || start > end || /^['’]/u.test(token.trailer)) continue
      const before = tokens.slice(start, end)
      if (before.some(t => t.strongs || t.derived || t.sourceWord)) continue
      const original = before.map(t => t.surface + t.trailer).join('') + token.surface
      if (source.english !== original || token.strongs.startsWith('G') !== (source.language === 'Greek') ||
          !isSourceForm(source.language, source.text)) continue
      const preset = presetForm(source, original)
      const divineName = isProtectedSourceName(token.strongs)
      if ((!exact || divineName) && !preset) continue
      let display = preset ?? original
      let annotation: string | undefined
      if (exact && preset !== 'YHWH') {
        // A single English spelling can still absorb another source word (e.g. “cannot”).
        // Only replace it when its independence has been certified, or the existing preset
        // already verifies this particular lexical correspondence.
        const independent = source.canReplaceAlone === true && /^\p{L}+$/u.test(original) &&
          !!source.morph?.trim() && !source.morph.includes('|')
        if (preset || independent) display = source.text
        else annotation = source.text
      }
      replacements.set(start, { end, part: { token, original, display, ...(annotation ? { annotation } : {}) } })
    }
  }

  const segments: VerseSegment[] = []
  for (let index = 0; index < tokens.length; index++) {
    const restored = replacements.get(index)
    if (restored) index = restored.end
    const token = tokens[index]
    segments.push(restored?.part ?? { token, original: token.surface, display: token.surface })
    if (token.trailer) segments.push({ original: token.trailer, display: token.trailer })
  }
  return segments
}
