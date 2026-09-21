/**
 * Quick Replace — showing the ORIGINAL word in place of its traditional English rendering
 * (LORD → Yahweh, love → agape). Lives in `shared` because two very different callers need the
 * exact same rules: the reader renders with them, and the build-time validator checks them
 * against the Hebrew morphology (see test/db.test.ts).
 */

// "Quick Replace": render the ORIGINAL word (its transliteration) in place of the traditional
// English rendering — LORD → Yahweh, love → agape, Christ → Christos. It only ever shows the
// original text, never a new interpretation. Applied through the word-replace map, so it affects
// translations that carry Strong's tags (KJV, BSB). Each term can be toggled and its rendering
// customised; divine names are on by default, everything else is opt-in. Persists across restarts.
export type QuickReplaceCategory =
  | 'divine'
  | 'jesus'
  | 'love'
  | 'marriage'
  | 'satan'
  | 'afterlife'
  | 'other'

export const QUICK_REPLACE_CATEGORIES: { id: QuickReplaceCategory; label: string }[] = [
  { id: 'divine', label: 'Divine names' },
  { id: 'jesus', label: 'Jesus & his titles' },
  { id: 'love', label: 'Love' },
  { id: 'marriage', label: 'Marriage' },
  { id: 'satan', label: 'Satan & evil' },
  { id: 'afterlife', label: 'Heaven & hell' },
  { id: 'other', label: 'Other key terms' }
]

export interface QuickReplaceItem {
  strongs: string
  glyph: string // original-language lemma glyph, for the settings UI
  traditional: string // the usual English rendering
  default: string // default replacement — always the ORIGINAL word, transliterated
  category: QuickReplaceCategory
  defaultOn?: boolean // divine names default on (preserves prior behaviour); others opt-in
  /**
   * English words that may be replaced. A Strong's number can carry more than one sense — H5945 is
   * the divine title "Most High" AND the ordinary adjective "upper" — and replacing on the number
   * alone rewrites the wrong ones ("the upper chamber" → "the Elyon chamber"). Declaring the forms
   * confines the substitution to the sense this entry is about. Matching is whole-word and
   * case-insensitive; the token's whole surface is searched, so "of the LORD" matches "lord".
   * Omit to replace wherever the number appears (the prior behaviour).
   */
  forms?: string[]
  /**
   * True when the replacement is a personal NAME rather than a title or common noun, so a definite
   * article immediately before it is dropped: "of the LORD" → "of Yahweh", not "of the Yahweh".
   *
   * This isn't a style choice — it follows the Hebrew. יהוה is parsed `Npt` (proper noun) and never
   * takes the article, so the "the" in "the LORD" belongs to the LORD-substitution convention and
   * translates nothing. Titles that Hebrew *does* article (אֱלֹהִים → הָאֱלֹהִים) keep theirs, which
   * is why H430/H410 are not marked here.
   */
  properName?: boolean
}

export const QUICK_REPLACE_LIST: QuickReplaceItem[] = [
  // Divine names (Hebrew) — on by default
  { strongs: 'H3068', glyph: 'יהוה', traditional: 'LORD', default: 'Yahweh', category: 'divine', defaultOn: true, forms: ['lord', 'jehovah', 'yahweh'], properName: true },
  { strongs: 'H3069', glyph: 'יהוה', traditional: 'GOD', default: 'Yahweh', category: 'divine', defaultOn: true, forms: ['god', 'lord', 'jehovah'], properName: true },
  { strongs: 'H3050', glyph: 'יָהּ', traditional: 'JAH', default: 'Yah', category: 'divine', defaultOn: true, forms: ['jah', 'yah', 'lord'], properName: true },
  { strongs: 'H136', glyph: 'אֲדֹנָי', traditional: 'Lord', default: 'Adonai', category: 'divine', defaultOn: true, forms: ['lord'], properName: true },
  { strongs: 'H410', glyph: 'אֵל', traditional: 'God', default: 'El', category: 'divine', defaultOn: true, forms: ['god'] },
  { strongs: 'H430', glyph: 'אֱלֹהִים', traditional: 'God', default: 'Elohim', category: 'divine', defaultOn: true, forms: ['god', 'gods'] },
  { strongs: 'H433', glyph: 'אֱלוֹהַּ', traditional: 'God', default: 'Eloah', category: 'divine', defaultOn: true, forms: ['god'] },
  { strongs: 'H7706', glyph: 'שַׁדַּי', traditional: 'Almighty', default: 'Shaddai', category: 'divine', defaultOn: true, forms: ['almighty', 'shaddai'], properName: true },
  { strongs: 'H5945', glyph: 'עֶלְיוֹן', traditional: 'most High', default: 'Elyon', category: 'divine', defaultOn: true, forms: ['most high', 'high', 'highest'], properName: true },
  // Jesus & his titles (Greek) — original forms, not reinterpretations
  { strongs: 'G2424', glyph: 'Ἰησοῦς', traditional: 'Jesus', default: 'Yeshua', category: 'jesus', properName: true },
  { strongs: 'G5547', glyph: 'Χριστός', traditional: 'Christ', default: 'Christos', category: 'jesus' },
  { strongs: 'G2962', glyph: 'κύριος', traditional: 'Lord', default: 'Kyrios', category: 'jesus' },
  { strongs: 'G1694', glyph: 'Ἐμμανουήλ', traditional: 'Emmanuel', default: 'Immanuel', category: 'jesus', properName: true },
  { strongs: 'G3056', glyph: 'λόγος', traditional: 'Word', default: 'Logos', category: 'jesus' },
  // Love
  { strongs: 'G26', glyph: 'ἀγάπη', traditional: 'love', default: 'agape', category: 'love' },
  { strongs: 'G25', glyph: 'ἀγαπάω', traditional: 'love', default: 'agapao', category: 'love' },
  { strongs: 'G5368', glyph: 'φιλέω', traditional: 'love', default: 'phileo', category: 'love' },
  { strongs: 'G5373', glyph: 'φιλία', traditional: 'friendship', default: 'philia', category: 'love' },
  { strongs: 'H160', glyph: 'אַהֲבָה', traditional: 'love', default: 'ahavah', category: 'love' },
  { strongs: 'H157', glyph: 'אָהֵב', traditional: 'love', default: 'ahav', category: 'love' },
  { strongs: 'H2617', glyph: 'חֶסֶד', traditional: 'lovingkindness', default: 'chesed', category: 'love' },
  // Marriage
  { strongs: 'G1062', glyph: 'γάμος', traditional: 'marriage', default: 'gamos', category: 'marriage' },
  { strongs: 'G3565', glyph: 'νύμφη', traditional: 'bride', default: 'nymphe', category: 'marriage' },
  { strongs: 'G3566', glyph: 'νυμφίος', traditional: 'bridegroom', default: 'nymphios', category: 'marriage' },
  // Satan & evil
  { strongs: 'H7854', glyph: 'שָׂטָן', traditional: 'Satan', default: 'satan', category: 'satan' },
  { strongs: 'G4567', glyph: 'Σατανᾶς', traditional: 'Satan', default: 'Satanas', category: 'satan' },
  { strongs: 'G1228', glyph: 'διάβολος', traditional: 'devil', default: 'diabolos', category: 'satan' },
  { strongs: 'G954', glyph: 'Βεελζεβούλ', traditional: 'Beelzebub', default: 'Beelzeboul', category: 'satan' },
  { strongs: 'H1100', glyph: 'בְּלִיַּעַל', traditional: 'Belial', default: 'Belial', category: 'satan' },
  { strongs: 'H5175', glyph: 'נָחָשׁ', traditional: 'serpent', default: 'nachash', category: 'satan' },
  // Heaven & hell
  { strongs: 'H8064', glyph: 'שָׁמַיִם', traditional: 'heaven', default: 'shamayim', category: 'afterlife' },
  { strongs: 'G3772', glyph: 'οὐρανός', traditional: 'heaven', default: 'ouranos', category: 'afterlife' },
  { strongs: 'H7585', glyph: 'שְׁאוֹל', traditional: 'hell / grave', default: 'sheol', category: 'afterlife', forms: ['hell', 'grave', 'pit'] },
  { strongs: 'G86', glyph: 'ᾅδης', traditional: 'hell', default: 'hades', category: 'afterlife' },
  { strongs: 'G1067', glyph: 'γέεννα', traditional: 'hell', default: 'gehenna', category: 'afterlife' },
  // Other key terms
  { strongs: 'H7307', glyph: 'רוּחַ', traditional: 'Spirit', default: 'ruach', category: 'other' },
  { strongs: 'G4151', glyph: 'πνεῦμα', traditional: 'Spirit', default: 'pneuma', category: 'other' },
  { strongs: 'G5485', glyph: 'χάρις', traditional: 'grace', default: 'charis', category: 'other' },
  { strongs: 'G4102', glyph: 'πίστις', traditional: 'faith', default: 'pistis', category: 'other' },
  { strongs: 'H7965', glyph: 'שָׁלוֹם', traditional: 'peace', default: 'shalom', category: 'other' },
  { strongs: 'G1515', glyph: 'εἰρήνη', traditional: 'peace', default: 'eirene', category: 'other' },
  { strongs: 'H1285', glyph: 'בְּרִית', traditional: 'covenant', default: 'berith', category: 'other' },
  { strongs: 'G1242', glyph: 'διαθήκη', traditional: 'covenant', default: 'diatheke', category: 'other' },
  { strongs: 'G1391', glyph: 'δόξα', traditional: 'glory', default: 'doxa', category: 'other' },
  { strongs: 'H3519', glyph: 'כָּבוֹד', traditional: 'glory', default: 'kavod', category: 'other' }
]

/** A case-insensitive whole-word matcher for any of `words`. */
function wholeWord(words: string[]): RegExp {
  const alts = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}])(${alts})(?![\\p{L}\\p{N}])`, 'iu')
}

/** Whole-word form matchers per Strong's number, for entries that declare `forms`. */
const QUICK_REPLACE_FORMS: Record<string, RegExp> = Object.fromEntries(
  QUICK_REPLACE_LIST.filter((i) => i.forms?.length).map((i) => [i.strongs, wholeWord(i.forms!)])
)

/**
 * Where inside a token's surface the replaceable word sits. Entries that declare `forms` use them;
 * the rest fall back to their `traditional` rendering. This is used ONLY to position the
 * substitution — never to decide whether it happens, which stays `quickReplaceApplies`.
 */
const QUICK_REPLACE_LOCATORS: Record<string, RegExp> = Object.fromEntries(
  QUICK_REPLACE_LIST.map((i) => [i.strongs, wholeWord(i.forms?.length ? i.forms : [i.traditional])])
)

const PROPER_NAMES = new Set(QUICK_REPLACE_LIST.filter((i) => i.properName).map((i) => i.strongs))

/** A definite article directly in front of the name, with nothing word-like before it. */
const ARTICLE_BEFORE_NAME = /(?<![\p{L}\p{N}])the(\s*)$/iu

/**
 * May this token be replaced? Entries that declare `forms` only substitute where the word actually
 * carries the sense the entry is about — see QuickReplaceItem.forms. Entries without forms keep the
 * prior behaviour of replacing wherever the number appears.
 */
export function quickReplaceApplies(strongs: string, surface: string): boolean {
  const re = QUICK_REPLACE_FORMS[strongs]
  return re ? re.test(surface) : true
}

/** A surface split around its replacement, so the words either side of the name survive. */
export interface ReplacedSurface {
  before: string
  replaced: string
  after: string
  /** The text the locator actually matched, e.g. "high" out of the form "most high". */
  matched: string
  /** True when an article was already dropped from `before`, so no neighbour should be trimmed. */
  droppedArticle: boolean
}

/**
 * Substitute the original word into ONE token's surface.
 *
 * Tagged translations align a whole English phrase to a single original word — the BSB maps
 * "of the LORD" to `לַיהוָה` — so replacing the entire surface deleted the words around the name
 * and produced "the Day Yahweh is near". Only the name itself is replaced; everything else in the
 * surface is kept.
 *
 * The Hebrew is what decides this. In Ezekiel 30:3 the preposition is prefixed to the name's own
 * word (`HR/Npt`, glossed "of Yahweh"), while in 30:1 the name is bare (`HNpt`) and the "of" comes
 * from the construct state of the PREVIOUS word — the aligner simply bundled it into this token's
 * surface. Either way the "of" is not a rendering of the name, so it stays. Only a definite
 * article is dropped, and only for proper names (see `QuickReplaceItem.properName`).
 *
 * When the word can't be located, the whole surface is replaced — the behaviour before this
 * existed — so nothing that used to be substituted silently stops being substituted.
 */
export function applyQuickReplace(
  strongs: string,
  surface: string,
  replacement: string
): ReplacedSurface {
  const m = QUICK_REPLACE_LOCATORS[strongs]?.exec(surface)
  if (!m) {
    return { before: '', replaced: replacement, after: '', matched: surface, droppedArticle: false }
  }
  const before = surface.slice(0, m.index)
  const trimmed = quickReplaceDropsArticle(strongs) ? stripTrailingArticle(before) : null
  return {
    before: trimmed ?? before,
    replaced: replacement,
    after: surface.slice(m.index + m[0].length),
    matched: m[0],
    droppedArticle: trimmed !== null
  }
}

/**
 * Does a definite article immediately before this word get dropped?
 *
 * Needed outside `applyQuickReplace` because word-tagged translations put the article in its OWN
 * token — the KJV tokenises "of the LORD" as `of` · `the` · `LORD`, so the "the" to drop belongs to
 * the previous token and this one's surface starts at the name. Without this the KJV printed
 * "the day of the Yahweh" in 6,586 places.
 */
export function quickReplaceDropsArticle(strongs: string): boolean {
  return PROPER_NAMES.has(strongs)
}

/**
 * A multi-word rendering can straddle a token boundary as well: the KJV splits "most high" into
 * `most` · `high`, so replacing H5945 on the second token alone left "the most Elyon" standing in
 * 16 verses. Given what the locator matched, drop the earlier words of that same form off the end
 * of `text`. Null when `text` doesn't end with them.
 */
export function stripFormLeadIn(strongs: string, matched: string, text: string): string | null {
  const item = QUICK_REPLACE_LIST.find((i) => i.strongs === strongs)
  const tail = matched.trim().toLowerCase()
  for (const form of item?.forms ?? []) {
    const lead = form.toLowerCase().endsWith(' ' + tail)
      ? form.slice(0, form.toLowerCase().lastIndexOf(' ' + tail))
      : null
    if (!lead) continue
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${lead.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'iu')
    if (re.test(text)) return text.replace(re, '')
  }
  return null
}

/** Drop a standalone definite article from the END of `text`; null when there isn't one. */
export function stripTrailingArticle(text: string): string | null {
  const m = ARTICLE_BEFORE_NAME.exec(text)
  if (!m) return null
  // Whatever joined the article to what came before it is what now joins to the name — a space in
  // "of the LORD", nothing at all in "“The LORD". Inventing a space instead would print "“ Yahweh".
  const head = text.slice(0, m.index)
  // Unless the article ended the text: then the spacing lives in the token's trailer, and keeping
  // a space here too would print "of  Yahweh’s".
  return m[1] === '' ? head.replace(/\s+$/, '') : head
}

export type QuickReplaceConfig = Record<string, { enabled: boolean; custom: string }>

/** The Strong's→text entries contributed by Quick Replace (empty when the master toggle is off). */
export function computeQuickReplacements(
  on: boolean,
  cfg: QuickReplaceConfig
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!on) return out
  for (const item of QUICK_REPLACE_LIST) {
    const c = cfg[item.strongs]
    const enabled = c ? c.enabled : !!item.defaultOn
    if (!enabled) continue
    out[item.strongs] = c?.custom?.trim() || item.default
  }
  return out
}

/** The shape `renderQuickReplace` needs from a verse token. */
export interface QuickReplaceToken {
  strongs: string | null
  surface: string
  trailer?: string | null
}

/** One token's final text: the name span (when replaced), the surrounding text, and the trailer. */
export interface RenderedToken {
  part?: ReplacedSurface
  tail: string
  trailer: string
}

/**
 * Resolve a whole verse at once. It has to be the whole verse rather than token-by-token, because
 * a token's rendering can depend on its neighbour — see `quickReplaceDropsArticle`.
 *
 * `replacementFor` returns the substitution for a token, or undefined to leave it alone.
 */
export function renderQuickReplace<T extends QuickReplaceToken>(
  toks: readonly T[],
  replacementFor: (t: T) => ReplacedSurface | undefined
): RenderedToken[] {
  const parts = toks.map(replacementFor)
  const tails = toks.map((t) => t.surface)
  for (let i = 1; i < toks.length; i++) {
    const part = parts[i]
    const strongs = toks[i].strongs
    if (!part || !strongs) continue
    // Already handled inside this surface — either words still stand before the name, or the
    // article that stood there has just been removed.
    if (part.droppedArticle || /[\p{L}\p{N}]/u.test(part.before)) continue
    // Only untagged neighbours may be trimmed: a token carrying its own Strong's number is a word
    // the reader can click and look up, so it must not silently disappear (KJV Numbers 11:29 tags
    // the "the" of "the LORD's people").
    const strippable = (k: number): boolean => k >= 0 && !parts[k] && !toks[k].strongs
    // Walk back over the neighbours the rendering spills into. "the most high" is three KJV
    // tokens, so clearing "most" leaves the article a further token back.
    let j = i - 1
    if (strippable(j)) {
      const lead = stripFormLeadIn(strongs, part.matched, tails[j])
      if (lead !== null) {
        tails[j] = lead
        if (lead === '') j--
      }
    }
    if (quickReplaceDropsArticle(strongs) && strippable(j)) {
      const article = stripTrailingArticle(tails[j])
      if (article !== null) tails[j] = article
    }
  }
  // A token that WAS just the article now renders nothing, so its trailing space has to go too,
  // or the gap shows up as stretched spacing in justified text.
  return toks.map((t, i) => ({
    part: parts[i],
    tail: tails[i],
    trailer:
      /(^|[“‘("'\[{])$/u.test(tails[i]) && !/\S/.test(t.trailer ?? '') ? '' : (t.trailer ?? '')
  }))
}
