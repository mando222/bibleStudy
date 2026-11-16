import type { ChapterRef, SourceWitness, SourceWord, Verse, VerseToken } from './types'

/** First bundled alignment that verifies lexical spans and independent KJV witnesses. */
export const SOURCE_WORD_ALIGNMENT_VERSION = '1'

/** These English forms identify a term in the published text. They never supply its display spelling. */
interface SourceWordTerm {
  label: string
  ids: string[]
  english: RegExp
  defaultOn?: boolean
  /**
   * A name, so the publisher's extra English in the span belongs to the sentence rather than to
   * this word: "of the LORD" is one Hebrew word, the "of" owed to the construct form of the word
   * before it. A common noun gets no such licence, because English really can need several words
   * for one of them — "loving devotion" is all of ḥeseḏ, and splitting it strands "devotion".
   */
  name?: boolean
}

export const SOURCE_WORD_TERMS: SourceWordTerm[] = [
  { label: 'Divine name (YHWH)', ids: ['H3068', 'H3069'], english: /^(?:(?:The|the|THE) )?(?:LORD|GOD|Jehovah|YHWH)$/, defaultOn: true, name: true },
  { label: 'Short divine name (Yah)', ids: ['H3050'], english: /^(?:(?:The|the|THE) LORD|LORD|JAH|Jah|Yah)$/, name: true },
  { label: 'God', ids: ['H410', 'H430', 'H433'], english: /^gods?$/i },
  { label: 'Lord', ids: ['H136', 'G2962'], english: /^lords?$/i, name: true },
  { label: 'Almighty', ids: ['H7706'], english: /^Almighty$/, name: true },
  { label: 'Most High', ids: ['H5945'], english: /^Most High$/, name: true },
  { label: 'Jesus / Joshua', ids: ['G2424'], english: /^(?:Jesus|Joshua)$/, name: true },
  { label: 'Christ', ids: ['G5547'], english: /^(?:Christ|Messiah)$/, name: true },
  { label: 'Immanuel', ids: ['G1694'], english: /^(?:Immanuel|Emmanuel)$/, name: true },
  { label: 'Word', ids: ['G3056'], english: /^words?$/i },
  { label: 'Love', ids: ['G26', 'G25', 'G5368', 'G5373', 'H160', 'H157', 'H2617'], english: /^(?:love[ds]?|loving|beloved|friendship|lovingkindness)$/i },
  { label: 'Husband', ids: ['H376', 'H1167', 'G435'], english: /^husbands?$/i },
  { label: 'Wife', ids: ['H802', 'G1135'], english: /^(?:wife|wives)$/i },
  { label: 'Marriage', ids: ['G1062', 'G1060', 'H1166'], english: /^(?:(?:marriage|wedding)s?|marry|marries|married|marrying)$/i },
  { label: 'Bride', ids: ['G3565'], english: /^brides?$/i },
  { label: 'Bridegroom', ids: ['G3566'], english: /^bridegrooms?$/i },
  { label: 'Satan', ids: ['H7854', 'G4567'], english: /^Satan$/, name: true },
  { label: 'Devil', ids: ['G1228'], english: /^devils?$/i },
  { label: 'Beelzebul', ids: ['G954'], english: /^(?:Beelzebul|Beelzebub)$/, name: true },
  { label: 'Belial', ids: ['H1100'], english: /^Belial$/, name: true },
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

/**
 * The publisher aligns a whole English span to one source word, so a token can carry function
 * words that belong to the sentence rather than to the word itself — "of the LORD" is one Hebrew
 * word, the "of" owed to the construct form of the word before it. Locate just the part that
 * spells the term; everything else in the published span is printed exactly as it stands.
 */
export interface EnglishTermSpan {
  before: string
  term: string
  after: string
}

const locators = new Map<RegExp, RegExp>()
/** The term's own pattern, freed of its anchors, matched only at whole-word boundaries. */
function locator(english: RegExp): RegExp {
  const cached = locators.get(english)
  if (cached) return cached
  const body = english.source.replace(/^\^/, '').replace(/\$$/, '')
  const built = new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`,
    english.flags.includes('i') ? 'iu' : 'u')
  locators.set(english, built)
  return built
}

/** Narrows to the name where that is sound; otherwise the whole span stands as the term. */
export function locateEnglishTerm(id: string, english: string): EnglishTermSpan {
  const whole: EnglishTermSpan = { before: '', term: english, after: '' }
  const term = termsById.get(id)
  if (!term?.name) return whole
  const found = locator(term.english).exec(english)
  if (!found) return whole
  // English may inflect a name it has already spelled, but a word printed after it is part of
  // how this same source word was rendered, and cutting the name out would strand the rest.
  const after = english.slice(found.index + found[0].length)
  if (!/^(?:['’]s)?$/u.test(after)) return whole
  return { before: english.slice(0, found.index), term: found[0], after }
}

/** One written source word. Punctuation separating words or clauses is excluded. */
export function isSourceForm(language: SourceWord['language'], text: string): boolean {
  if (language === 'Greek') return /^\p{Script=Greek}[\p{Script=Greek}\p{M}]*[᾽’']?$/u.test(text)
  return (language === 'Hebrew' || language === 'Aramaic') && /^[א-ת][א-ת\p{M}]*$/u.test(text)
}

export interface VerseSegment {
  original: string
  display: string
  /** Published words the publisher bundled into this span, kept verbatim around the restored term. */
  before?: string
  after?: string
  /** A source word shown beside an intact English span that has no independent word boundary. */
  annotation?: string
  token?: VerseToken
}

/** The edition's wording behind the visible source form. A layout break may split an
 * annotated phrase across lines, so take its complete wording from the verified link. */
export function publishedWording(part: VerseSegment): string {
  if (part.annotation && part.token?.sourceWord) return part.token.sourceWord.english
  return part.original.slice(part.before?.length ?? 0, part.original.length - (part.after?.length ?? 0))
}

export const isProtectedSourceName = (id: string): boolean => id === 'H3068' || id === 'H3069' || id === 'H3050'

/** `english` is the term itself, as located by {@link locateEnglishTerm} — never a whole phrase. */
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

/** The old corpus identifies a Berean row by its sort number. Packs identify the witness,
 * its pinned revision and the occurrence separately from the address in the English edition. */
export function validSourceWitness(source: SourceWord, translation: string): boolean {
  if (source.translation === undefined) {
    return source.edition === 'BSB' && /^[1-9]\d*(?:\.\d+)?$/.test(source.rowId) &&
      ((translation === 'BSB' && source.evidence === 'aligned') ||
       (translation === 'KJV' && source.evidence === 'corroborated'))
  }
  const ref = source.sourceRef
  return source.translation === translation && !!source.edition.trim() && !!source.sourceRevision?.trim() &&
    !!source.citation?.trim() && !!source.rowId?.trim() && !!ref?.book && Number.isSafeInteger(ref.chapter) &&
    ref.chapter > 0 && Number.isSafeInteger(ref.verse) && ref.verse > 0 &&
    (ref.position === undefined || (Number.isSafeInteger(ref.position) && ref.position >= 0)) &&
    (source.evidence === 'aligned' || source.evidence === 'corroborated')
}

export function sameSourceOccurrence(a: SourceWord, b: SourceWord): boolean {
  if (a.language !== b.language || a.strongs !== b.strongs) return false
  if (!a.sourceRevision || !b.sourceRevision) {
    return a.sourceRevision === b.sourceRevision && a.edition === b.edition && a.rowId === b.rowId &&
      a.book === b.book && a.chapter === b.chapter && a.verse === b.verse && a.text === b.text
  }
  const matches = (x: SourceWitness | SourceWord, y: SourceWitness | SourceWord) => x.edition === y.edition &&
    x.sourceRevision === y.sourceRevision && x.rowId === y.rowId && !!x.sourceRef && !!y.sourceRef &&
    x.sourceRef.book === y.sourceRef.book && x.sourceRef.chapter === y.sourceRef.chapter &&
    x.sourceRef.verse === y.sourceRef.verse && x.sourceRef.position === y.sourceRef.position
  if (matches(a, b)) return a.text.normalize('NFC') === b.text.normalize('NFC')
  return [a, ...(a.correspondences ?? [])].some(x =>
    [b, ...(b.correspondences ?? [])].some(y => matches(x, y)))
}

export function sourceAnchorId(source: SourceWord): string {
  return source.edition !== 'BSB' && source.sourceRevision
    ? encodeURIComponent(JSON.stringify([source.edition, source.sourceRevision, source.language, source.rowId, source.sourceRef]))
    : source.language + ':' + source.rowId
}

export function sourceLocation(source: SourceWord | SourceWitness): string {
  const r = ('book' in source ? source.sourceRef ?? source : source.sourceRef)
  return `${source.edition} · ${r.book} ${r.chapter}:${r.verse} · row ${source.rowId}`
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
  if (enabled) {
    const exactIds = new Set(sourceFormIds)
    for (let end = 0; end < tokens.length; end++) {
      const token = tokens[end]
      const source = token.sourceWord
      if (!source || token.derived || !token.strongs || !/^[GH][1-9]\d*$/.test(token.strongs) ||
          source.strongs !== token.strongs || !validSourceWitness(source, ref.translation) ||
          source.book !== ref.book || source.chapter !== ref.chapter || source.verse !== verse.verse ||
          source.endPosition !== end) continue
      const exact = exactIds.has(token.strongs)
      if (!exact && !termEnabled(token.strongs, terms)) continue
      const start = source.startPosition
      if (!Number.isInteger(start) || start < 0 || start > end || /^['’]/u.test(token.trailer)) continue
      const before = tokens.slice(start, end)
      if (before.some(t => t.strongs || t.derived || t.sourceWord)) continue
      const original = before.map(t => t.surface + t.trailer).join('') + token.surface
      if (source.english !== original || token.strongs.startsWith('G') !== (source.language === 'Greek') ||
          !isSourceForm(source.language, source.text)) continue
      const located = locateEnglishTerm(token.strongs, original)
      const preset = presetForm(source, located.term)
      const divineName = isProtectedSourceName(token.strongs)
      if ((!exact || divineName) && !preset) continue
      let restored = preset ?? located.term
      let annotation: string | undefined
      if (exact && preset !== 'YHWH') {
        // A single English spelling can still absorb another source word (e.g. “cannot”).
        // Only replace it when its independence has been certified, or the existing preset
        // already verifies this particular lexical correspondence.
        const independent = source.canReplaceAlone === true && /^\p{L}+$/u.test(original) &&
          !!source.morph?.trim() && !source.morph.includes('|')
        if (preset || independent) restored = source.text
        else annotation = source.text
      }
      // Migrated Berean alignments retain their reviewed name/term boundaries.
      // Other packs explicitly certify which spans can replace an English word.
      const reviewedTerm = !source.translation || source.preservePreset
      if (!reviewedTerm && !source.canReplaceAlone) {
        restored = located.term
        annotation = exact && !divineName ? source.text : preset
      }
      const display = located.before + restored + located.after
      replacements.set(start, { end, part: { token, original, display,
        before: located.before, after: located.after, ...(annotation ? { annotation } : {}) } })
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
