// Scripture-reference parsing shared by the AI answers (clickable refs) and, later, note
// auto-linkification. Pure/renderer-safe: no Electron or DOM dependencies.
import { BOOKS, BOOK_BY_ID } from './books'

export interface RefMatch {
  start: number // index into the source string
  end: number
  book: string // book id, e.g. 'John'
  bookName: string // canonical display name, e.g. 'John'
  chapter: number
  verse: number
}

// Curated abbreviations → book id. Deliberately omits 2-letter forms that collide with common
// English words (Is, Am, So, We, Ho…) to avoid false positives in prose. Full names, ids, and
// USFM codes are added automatically below.
const ABBREV: Record<string, string> = {
  gen: 'Gen', ge: 'Gen', gn: 'Gen',
  exo: 'Exod', exod: 'Exod', exd: 'Exod',
  lev: 'Lev', lv: 'Lev',
  num: 'Num', nm: 'Num', nu: 'Num',
  deut: 'Deut', deu: 'Deut', dt: 'Deut',
  josh: 'Josh', jos: 'Josh',
  judg: 'Judg', jdg: 'Judg',
  rut: 'Ruth', rth: 'Ruth',
  '1sam': '1Sam', '1sa': '1Sam', '1sm': '1Sam',
  '2sam': '2Sam', '2sa': '2Sam', '2sm': '2Sam',
  '1kgs': '1Kgs', '1ki': '1Kgs', '1kg': '1Kgs',
  '2kgs': '2Kgs', '2ki': '2Kgs', '2kg': '2Kgs',
  '1chr': '1Chr', '1ch': '1Chr',
  '2chr': '2Chr', '2ch': '2Chr',
  ezr: 'Ezra',
  neh: 'Neh',
  est: 'Esth', esth: 'Esth',
  job: 'Job',
  ps: 'Ps', psa: 'Ps', psalm: 'Ps', psalms: 'Ps', pss: 'Ps',
  prov: 'Prov', prv: 'Prov', pro: 'Prov',
  eccl: 'Eccl', ecc: 'Eccl', qoh: 'Eccl',
  song: 'Song', sos: 'Song', cant: 'Song',
  isa: 'Isa', isai: 'Isa',
  jer: 'Jer', jr: 'Jer',
  lam: 'Lam',
  ezek: 'Ezek', eze: 'Ezek', ezk: 'Ezek',
  dan: 'Dan', dn: 'Dan',
  hos: 'Hos',
  joe: 'Joel', jol: 'Joel',
  amo: 'Amos',
  oba: 'Obad', obad: 'Obad',
  jon: 'Jonah', jnh: 'Jonah',
  mic: 'Mic',
  nah: 'Nah', nam: 'Nah',
  hab: 'Hab',
  zep: 'Zeph', zeph: 'Zeph',
  hag: 'Hag',
  zec: 'Zech', zech: 'Zech',
  mal: 'Mal',
  mat: 'Matt', matt: 'Matt', mt: 'Matt',
  mrk: 'Mark', mk: 'Mark',
  luk: 'Luke', lk: 'Luke',
  joh: 'John', jhn: 'John', jn: 'John',
  act: 'Acts',
  rom: 'Rom', ro: 'Rom',
  '1cor': '1Cor', '1co': '1Cor',
  '2cor': '2Cor', '2co': '2Cor',
  gal: 'Gal',
  eph: 'Eph',
  phil: 'Phil', php: 'Phil',
  col: 'Col',
  '1thess': '1Thess', '1the': '1Thess', '1th': '1Thess',
  '2thess': '2Thess', '2the': '2Thess', '2th': '2Thess',
  '1tim': '1Tim', '1ti': '1Tim',
  '2tim': '2Tim', '2ti': '2Tim',
  tit: 'Titus',
  phlm: 'Phlm', phm: 'Phlm',
  heb: 'Heb',
  jas: 'Jas', jam: 'Jas',
  '1pet': '1Pet', '1pe': '1Pet', '1pt': '1Pet',
  '2pet': '2Pet', '2pe': '2Pet', '2pt': '2Pet',
  '1joh': '1John', '1jn': '1John', '1jo': '1John',
  '2joh': '2John', '2jn': '2John', '2jo': '2John',
  '3joh': '3John', '3jn': '3John', '3jo': '3John',
  jud: 'Jude', jde: 'Jude',
  rev: 'Rev', rv: 'Rev', apoc: 'Rev'
}

// normalize any book form to a lookup key: lowercase, letters+digits only.
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// normalized name/abbrev → book id.
const NAME_INDEX: Record<string, string> = (() => {
  const idx: Record<string, string> = {}
  for (const b of BOOKS) {
    idx[norm(b.name)] = b.id // "1 Corinthians"
    idx[norm(b.id)] = b.id // "1Cor"
    idx[norm(b.usfm)] = b.id // "1CO"
  }
  for (const [k, id] of Object.entries(ABBREV)) idx[norm(k)] = id
  return idx
})()

// Capture a candidate book phrase (optional leading 1/2/3, then up to 3 words) directly before a
// "chapter:verse". The phrase is resolved in code — shedding leading non-book words — which handles
// numbered ("1 Corinthians") and multi-word ("Song of Solomon") names and any spacing.
const CAND_RE = /((?:[1-3]\s*)?[A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*){0,2})\s*(\d{1,3}):(\d{1,3})/g

/** Find every scripture reference in `text` that resolves to a known book. */
export function parseScriptureRefs(text: string): RefMatch[] {
  const out: RefMatch[] = []
  for (const m of text.matchAll(CAND_RE)) {
    const phrase = m[1]
    const chapter = Number(m[2])
    const verse = Number(m[3])
    const words = phrase.split(/\s+/).filter(Boolean)
    // Try the whole phrase, then progressively drop leading words ("the world John" → "John").
    for (let d = 0; d < words.length; d++) {
      const id = NAME_INDEX[norm(words.slice(d).join(''))]
      if (!id) continue
      const meta = BOOK_BY_ID[id]
      if (!meta || chapter < 1 || chapter > meta.chapters) break // impossible chapter → not a ref
      // Advance the start past any dropped leading words.
      let idx = 0
      for (let w = 0; w < d; w++) idx = phrase.indexOf(words[w], idx) + words[w].length
      while (idx < phrase.length && /\s/.test(phrase[idx])) idx++
      const start = (m.index ?? 0) + idx
      out.push({ start, end: (m.index ?? 0) + m[0].length, book: id, bookName: meta.name, chapter, verse })
      break
    }
  }
  return out
}
