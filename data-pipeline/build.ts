/**
 * Builds the bundled read-only `resources/bible.sqlite` from public-domain /
 * openly-licensed sources. Run with:  npm run db:build
 *
 * Uses Node's built-in `node:sqlite` (no native module). See
 * data-pipeline/schema.sql for the shape it produces.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BOOKS, BOOK_BY_USFM } from '../src/shared/books'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(ROOT, 'resources', 'bible.sqlite')
const SCHEMA = join(HERE, 'schema.sql')

interface TranslationSource {
  id: string // our id
  helloaoId: string // helloao API id
  abbrev: string
  name: string
  license: string
  attribution: string
  sortOrder: number
}

// v1 reading set — all public domain.
const TRANSLATIONS: TranslationSource[] = [
  {
    id: 'KJV',
    helloaoId: 'eng_kjv',
    abbrev: 'KJV',
    name: 'King James Version',
    license: 'Public Domain',
    attribution: 'King James Version (1769). Public Domain.',
    sortOrder: 1
  },
  {
    id: 'BSB',
    helloaoId: 'BSB',
    abbrev: 'BSB',
    name: 'Berean Standard Bible',
    license: 'Public Domain',
    attribution: 'Berean Standard Bible. Public Domain (berean.bible).',
    sortOrder: 2
  },
  {
    id: 'WEB',
    helloaoId: 'ENGWEBP',
    abbrev: 'WEB',
    name: 'World English Bible',
    license: 'Public Domain',
    attribution: 'World English Bible. Public Domain (eBible.org).',
    sortOrder: 3
  },
  {
    id: 'YLT',
    helloaoId: 'eng_ylt',
    abbrev: 'YLT',
    name: "Young's Literal Translation",
    license: 'Public Domain',
    attribution: "Young's Literal Translation (1898). Public Domain.",
    sortOrder: 6
  }
]

// Julia Smith 1876 — clean DBS digital text served per-chapter on studybible.info.
const JULIA_SMITH_BASE = 'https://studybible.info/JuliaSmith'
const JULIA_SMITH_BOOK: Record<string, string> = { Song: 'Song of Songs' } // else use book.name

// STEPBible Translators Amalgamated OT+NT (CC BY 4.0) — tagged original-language editions.
const STEP_BASE =
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT'
const TAGNT_FILES: [string, string][] = [
  ['tagnt_mat-jhn.txt', `${STEP_BASE}/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt`],
  ['tagnt_act-rev.txt', `${STEP_BASE}/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt`]
]
const TAHOT_FILES: [string, string][] = [
  ['tahot_gen-deu.txt', `${STEP_BASE}/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt`],
  ['tahot_jos-est.txt', `${STEP_BASE}/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt`],
  ['tahot_job-sng.txt', `${STEP_BASE}/TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt`],
  ['tahot_isa-mal.txt', `${STEP_BASE}/TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt`]
]

const EDITIONS: { id: string; name: string; language: string; testament: string; sort: number }[] = [
  { id: 'MT', name: 'Masoretic (WLC)', language: 'hbo', testament: 'OT', sort: 1 },
  { id: 'LXX', name: 'Septuagint (Swete)', language: 'grc', testament: 'OT', sort: 2 },
  { id: 'NA', name: 'Critical (NA/SBL)', language: 'grc', testament: 'NT', sort: 3 },
  { id: 'TR', name: 'Textus Receptus', language: 'grc', testament: 'NT', sort: 4 },
  { id: 'BYZ', name: 'Byzantine', language: 'grc', testament: 'NT', sort: 5 }
]

// Septuagint — Swete's text (public domain), digitised by Open Greek and Latin / First1KGreek
// (tlg0527) and repackaged by nathans/lxx-swete under CC BY-SA 4.0. One accented Greek word per
// line, prefixed `1.chapter.verse`. Protocanon books only (mapped to our 66-book canon); LXX-only
// deuterocanon, the combined Esdras B (Ezra+Neh), and Ecclesiastes (absent upstream) are omitted.
// Daniel uses the Theodotion recension (the text printed in standard editions).
const LXX_BASE = 'https://raw.githubusercontent.com/nathans/lxx-swete/master/data'
const LXX_SWETE_FILES: [string, string][] = [
  ['Gen', '01.Genesis.txt'],
  ['Exod', '02.Exodus.txt'],
  ['Lev', '03.Leviticus.txt'],
  ['Num', '04.Numeri.txt'],
  ['Deut', '05.Deuteronomium.txt'],
  ['Josh', '06.Josue.txt'],
  ['Judg', '08.Judices.txt'],
  ['Ruth', '10.Ruth.txt'],
  ['1Sam', '11.Regnorum_I.txt'],
  ['2Sam', '12.Regnorum_II.txt'],
  ['1Kgs', '13.Regnorum_III.txt'],
  ['2Kgs', '14.Regnorum_IV.txt'],
  ['1Chr', '15.Paralipomenon_I.txt'],
  ['2Chr', '16.Paralipomenon_II.txt'],
  ['Esth', '19.Esther.txt'],
  ['Ps', '27.Psalmi.txt'],
  ['Prov', '29.Proverbia.txt'],
  ['Song', '31.Canticum.txt'],
  ['Job', '32.Job.txt'],
  ['Hos', '36.Osee.txt'],
  ['Amos', '37.Amos.txt'],
  ['Mic', '38.Michaeas.txt'],
  ['Joel', '39.Joel.txt'],
  ['Obad', '40.Abdias.txt'],
  ['Jonah', '41.Jonas.txt'],
  ['Nah', '42.Nahum.txt'],
  ['Hab', '43.Habacuc.txt'],
  ['Zeph', '44.Sophonias.txt'],
  ['Hag', '45.Aggaeus.txt'],
  ['Zech', '46.Zacharias.txt'],
  ['Mal', '47.Malachias.txt'],
  ['Isa', '48.Isaias.txt'],
  ['Jer', '49.Jeremias.txt'],
  ['Lam', '51.Threni_seu_Lamentationes.txt'],
  ['Ezek', '53.Ezechiel.txt'],
  ['Dan', '57.Daniel_Theodotionis_versio.txt']
]

// Scholarly lexicons (STEPBible, CC BY 4.0), keyed to extended Strong's numbers. TBESH is the
// Brown-Driver-Briggs Hebrew lexicon; TBESG the Abbott-Smith Greek NT lexicon; TFLSJ the full
// Liddell-Scott-Jones (broad Greek incl. LXX/classical). Same 8-column TSV as the tagged texts.
const STEP_REPO = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master'
const LEXICON_FILES: { id: string; file: string }[] = [
  { id: 'TBESH', file: 'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt' },
  { id: 'TBESG', file: 'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt' },
  { id: 'TFLSJ', file: 'Lexicons/TFLSJ  0-5624 - Translators Formatted full LSJ Bible lexicon - STEPBible.org CC BY.txt' }
]

// STEPBible book abbreviation (dotted ref) → our book id. Uppercased abbrev matches our USFM
// codes except a few; override those here.
const STEP_BOOK_OVERRIDE: Record<string, string> = { NAH: 'Nah' } // Nahum: STEP 'Nah' vs USFM 'NAM'

function stepBookId(abbrev: string): string | undefined {
  const up = abbrev.toUpperCase()
  return BOOK_BY_USFM[up]?.id ?? STEP_BOOK_OVERRIDE[up]
}

/** Normalise a STEPBible extended Strong's (e.g. "H0430G", "{H1254A}", "G1722") → "H430"/"G1722". */
function normStrongs(raw: string): string | null {
  const m = /([GH])0*(\d+)/.exec(raw)
  return m ? `${m[1]}${m[2]}` : null
}

const STRONGS_SOURCES = {
  greek:
    'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js',
  hebrew:
    'https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js'
}

// KJV with inline [G####]/[H####] Strong's tags, one JSON per book (canonical order).
const KJV_STRONGS_BASE = 'https://raw.githubusercontent.com/kaiserlik/kjv/main'

// BSB word-level interlinear table: one row per original-language word, aligned to the
// BSB English rendering, with Strong's + morphology. ~85MB; cached in sources/.
const BSB_TABLES_URL = 'https://bereanbible.com/bsb_tables.tsv'

// ---- helpers ---------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

/** helloao verse content is an array of strings + formatting/footnote objects. */
function verseText(content: unknown[]): string {
  const pieces: string[] = []
  for (const el of content) {
    if (typeof el === 'string') pieces.push(el)
    else if (el && typeof el === 'object' && typeof (el as { text?: unknown }).text === 'string') {
      pieces.push((el as { text: string }).text)
    }
    // {noteId}, {lineBreak}, {heading} etc. are skipped for plain reading text.
  }
  return pieces
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?’”'")\]])/g, '$1')
    .replace(/([“‘("[])\s+/g, '$1')
    .trim()
}

/** Extract the JSON object literal out of an openscriptures `var X = {...};` file. */
function parseDictJs(src: string): Record<string, Record<string, string>> {
  const eq = src.search(/var\s+strongs\w+Dictionary\s*=/)
  const start = src.indexOf('{', eq === -1 ? 0 : eq)
  const end = src.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('could not locate dictionary object')
  return JSON.parse(src.slice(start, end + 1))
}

interface Tok {
  surface: string
  trailer: string
  strongs: string | null
}

/** Parse kaiserlik KJV `en` strings like "In[G1722] the beginning[G746] was[G2258]".
 *  The source marks translator-supplied words with <em>…</em> HTML — strip those tags. */
function parseKjvTokens(en: string): Tok[] {
  const tagRe = /\[([GH]\d+)\]/g
  const out: Tok[] = []
  for (const raw of en.replace(/<\/?[a-z]+>/gi, '').split(/\s+/)) {
    if (!raw) continue
    const tags = [...raw.matchAll(tagRe)].map((m) => m[1])
    const clean = raw.replace(tagRe, '')
    const m = clean.match(/^(.*?)([^\p{L}\p{N}]*)$/u)
    const surface = (m?.[1] || clean).trim()
    const punct = m?.[2] ?? ''
    if (!surface && !punct) continue
    out.push({ surface: surface || clean, trailer: `${punct} `, strongs: tags[0] ?? null })
  }
  return out
}

/** Tag the BSB with per-word Strong's + original-language alignment from bsb_tables.tsv.
 *  Produces BSB verse_tokens: surface=English gloss, lemma=original word, translit, morph, strongs. */
async function tagBsb(db: DatabaseSync): Promise<number> {
  const path = join(HERE, 'sources', 'bsb_tables.tsv')
  if (!existsSync(path)) {
    process.stdout.write(' downloading bsb_tables.tsv (~85MB)…')
    const res = await fetch(BSB_TABLES_URL)
    if (!res.ok) throw new Error(`GET bsb_tables.tsv → ${res.status}`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }

  const bookByName = new Map(BOOKS.map((b) => [b.name, b.id]))
  bookByName.set('Psalm', 'Ps') // BSB uses the singular

  const insTok = db.prepare(
    `INSERT OR REPLACE INTO verse_tokens
       (translation_id, book_id, chapter, verse, position, surface, trailer, strongs, lemma, translit, morph, gloss)
     VALUES ('BSB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  )

  const lines = readFileSync(path, 'utf8').split('\n')
  let book = ''
  let chapter = 0
  let verse = 0
  let valid = false
  let pos = 0
  let count = 0

  db.exec('BEGIN')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const c = line.split('\t')
    if (c.length < 13) continue

    const rawVid = (c[12] ?? '').trim()
    if (rawVid) {
      const m = /^(.*) (\d+):(\d+)$/.exec(rawVid)
      const bid = m ? bookByName.get(m[1]) : undefined
      if (m && bid) {
        book = bid
        chapter = Number(m[2])
        verse = Number(m[3])
        valid = true
        pos = 0
      } else {
        valid = false
      }
    }
    if (!valid) continue

    const orig = (c[5] ?? '').trim()
    if (!orig) continue // padding row (no original word)
    const eng = (c[18] ?? '').trim()
    if (!eng || eng === '-') continue // untranslated particle → skip for reading/interlinear

    const strH = (c[10] ?? '').trim()
    const strG = (c[11] ?? '').trim()
    const strongs = strH ? `H${strH}` : strG ? `G${strG}` : null
    const translit = (c[7] ?? '').trim() || null
    const morph = (c[9] ?? '').trim() || null
    const pnc = c[19] ?? ''

    insTok.run(book, chapter, verse, pos, eng, `${pnc} `, strongs, orig, translit, morph)
    pos++
    count++
  }
  db.exec('COMMIT')
  db.prepare('UPDATE translations SET has_strongs = 1 WHERE id = ?').run('BSB')
  return count
}

interface JsVerse {
  book: string
  chapter: number
  verse: number
  text: string
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&#8217;': '’',
  '&#8216;': '‘',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8212;': '—'
}

function cleanJsText(t: string): string {
  return t
    .replace(/<sup>[\s\S]*?<\/sup>/g, ' ') // footnote markers
    .replace(/<[^>]+>/g, ' ') // tags
    .replace(/&[#a-z0-9]+;/gi, (e) => HTML_ENTITIES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Scrape the public-domain Julia Smith text from studybible.info (cached in sources/). */
async function fetchJuliaSmith(): Promise<JsVerse[]> {
  const cache = join(HERE, 'sources', 'juliasmith.json')
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as JsVerse[]

  const tasks: { book: string; sbName: string; ch: number }[] = []
  for (const b of BOOKS) {
    const sbName = JULIA_SMITH_BOOK[b.id] ?? b.name
    for (let ch = 1; ch <= b.chapters; ch++) tasks.push({ book: b.id, sbName, ch })
  }

  const boundRe = /<div|<a class="reference"|<sup><a class="version_info"|<\/article>/
  const out: JsVerse[] = []
  let idx = 0
  let done = 0

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const t = tasks[idx++]
      const url = `${JULIA_SMITH_BASE}/${encodeURIComponent(`${t.sbName} ${t.ch}`)}`
      let h = ''
      for (let attempt = 0; attempt < 3 && !h; attempt++) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'OpenBibleStudy/0.1 (+build)' } })
          if (r.ok) h = await r.text()
        } catch {
          /* retry */
        }
      }
      if (h) {
        const anchor = /<sup><a class="verse_ref JuliaSmith"[^>]*>(\d+)<\/a><\/sup>/g
        const ms = [...h.matchAll(anchor)]
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i]
          const s = (m.index ?? 0) + m[0].length
          let e = i + 1 < ms.length ? ms[i + 1].index ?? h.length : h.length
          if (i + 1 >= ms.length) {
            const bm = boundRe.exec(h.slice(s))
            if (bm) e = s + bm.index
          }
          const text = cleanJsText(h.slice(s, e))
          if (text) out.push({ book: t.book, chapter: t.ch, verse: Number(m[1]), text })
        }
      }
      if (++done % 100 === 0) process.stdout.write('.')
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()))
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, JSON.stringify(out))
  return out
}

// helloao complete.json shapes we rely on
interface CompleteBook {
  id: string
  chapters: { chapter: { number: number; content: ChapterBlock[] } }[]
}
interface ChapterBlock {
  type?: string
  number?: number
  content?: unknown[]
}
interface Complete {
  books: CompleteBook[]
}

async function downloadCached(name: string, url: string): Promise<string> {
  const p = join(HERE, 'sources', name)
  if (!existsSync(p)) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`GET ${name} → ${r.status}`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, Buffer.from(await r.arrayBuffer()))
  }
  return p
}

const STEP_ROW = /^[A-Za-z0-9]+\.\d+\.\d+#\d+/

/** Build TR / Byzantine / Critical (NA) Greek editions from TAGNT (per-word edition membership). */
async function buildGreekEditions(db: DatabaseSync): Promise<number> {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO original_tokens (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
  let count = 0
  for (const [name, url] of TAGNT_FILES) {
    const path = await downloadCached(name, url)
    const lines = readFileSync(path, 'utf8').split('\n')
    let curVerse = ''
    const pos: Record<string, number> = { NA: 0, TR: 0, BYZ: 0 }
    db.exec('BEGIN')
    for (const line of lines) {
      if (!STEP_ROW.test(line)) continue
      const c = line.split('\t')
      const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)#\d+/.exec(c[0])
      if (!m) continue
      const book = stepBookId(m[1])
      if (!book) continue
      const chapter = Number(m[2])
      const verse = Number(m[3])
      const vk = `${book}.${chapter}.${verse}`
      if (vk !== curVerse) {
        curVerse = vk
        pos.NA = 0
        pos.TR = 0
        pos.BYZ = 0
      }
      const sp = c[1].indexOf(' (')
      const original = (sp >= 0 ? c[1].slice(0, sp) : c[1]).trim()
      const translit = sp >= 0 ? c[1].slice(sp + 2).replace(/\)\s*$/, '').trim() : null
      const gloss = (c[2] || '').trim() || null
      const [sRaw, morph] = (c[3] || '').split('=')
      const strongs = normStrongs(sRaw || '')
      const ed = c[5] || ''
      const mem: string[] = []
      if (/NA2[78]|SBL/.test(ed)) mem.push('NA')
      if (/(^|\+)TR(\+|$)/.test(ed)) mem.push('TR')
      if (/Byz/.test(ed)) mem.push('BYZ')
      for (const e of mem) {
        ins.run(e, book, chapter, verse, pos[e]++, original, translit, strongs, morph || null, gloss)
        count++
      }
    }
    db.exec('COMMIT')
  }
  return count
}

/** Build the Masoretic (MT) Hebrew edition from TAHOT. */
async function buildHebrewEdition(db: DatabaseSync): Promise<number> {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO original_tokens (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss)
     VALUES ('MT',?,?,?,?,?,?,?,?,?)`
  )
  let count = 0
  for (const [name, url] of TAHOT_FILES) {
    const path = await downloadCached(name, url)
    const lines = readFileSync(path, 'utf8').split('\n')
    let curVerse = ''
    let pos = 0
    db.exec('BEGIN')
    for (const line of lines) {
      if (!STEP_ROW.test(line)) continue
      const c = line.split('\t')
      const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)#\d+/.exec(c[0])
      if (!m) continue
      const book = stepBookId(m[1])
      if (!book) continue
      const chapter = Number(m[2])
      const verse = Number(m[3])
      const vk = `${book}.${chapter}.${verse}`
      if (vk !== curVerse) {
        curVerse = vk
        pos = 0
      }
      const original = (c[1] || '').replace(/\//g, '').trim()
      if (!original) continue
      const translit = (c[2] || '').replace(/\//g, '').trim() || null
      const gloss = (c[3] || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || null
      const strongs = normStrongs(c[8] || c[4] || '')
      const morph = (c[5] || '').trim() || null
      ins.run(book, chapter, verse, pos++, original, translit, strongs, morph, gloss)
      count++
    }
    db.exec('COMMIT')
  }
  return count
}

// Greek → Latin (SBL-style) transliteration. Deterministic study aid, not accent-perfect.
const GK: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō'
}
function translitGreek(word: string): string | null {
  // Split into base-letter clusters, each carrying its combining marks (NFD).
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
    if (!(b in GK)) continue // drop accents-only artefacts and stray punctuation
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

/** Build the Septuagint (LXX) Greek OT edition from Swete's text (CC BY-SA, First1KGreek). */
async function buildSeptuagintEdition(db: DatabaseSync): Promise<number> {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO original_tokens (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss)
     VALUES ('LXX',?,?,?,?,?,?,?,?,?)`
  )
  const strip = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu // leading/trailing punctuation
  let count = 0
  for (const [book, file] of LXX_SWETE_FILES) {
    const path = await downloadCached(`lxx_${file}`, `${LXX_BASE}/${encodeURIComponent(file)}`)
    const lines = readFileSync(path, 'utf8').split('\n')
    let curVerse = ''
    let pos = 0
    db.exec('BEGIN')
    for (const raw of lines) {
      const sp = raw.indexOf(' ')
      if (sp < 0) continue
      const m = /^\d+\.(\d+)\.(\d+)$/.exec(raw.slice(0, sp).trim())
      if (!m) continue
      const original = raw.slice(sp + 1).trim().replace(strip, '')
      if (!original) continue
      const chapter = Number(m[1])
      const verse = Number(m[2])
      const vk = `${chapter}.${verse}`
      if (vk !== curVerse) {
        curVerse = vk
        pos = 0
      }
      // Strong's / lemma / morph / gloss are filled by the separate Phase-2 lemmatiser.
      ins.run(book, chapter, verse, pos++, original, translitGreek(original), null, null, null)
      count++
    }
    db.exec('COMMIT')
  }
  return count
}

/** Sanitise a STEPBible lexicon body to a safe subset: only <b>/<i> tags + newlines. */
function cleanLexBody(html: string): string {
  let s = html
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<ref\b[^>]*>(.*?)<\/ref>/gi, '$1') // keep the visible verse text
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1') // drop javascript hrefs, keep inner text
  s = s.replace(/<b\b[^>]*>/gi, '<b>').replace(/<i\b[^>]*>/gi, '<i>') // strip attributes
  s = s.replace(/<(?!\/?[bi]>)[^>]*>/g, '') // remove every remaining tag except <b>/<i>
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/** Load scholarly lexicons (BDB / Abbott-Smith / LSJ) keyed to Strong's numbers. */
async function buildLexicons(db: DatabaseSync): Promise<number> {
  const ins = db.prepare(
    `INSERT INTO lexicon_entries (lexicon, strongs, ext_key, headword, translit, gloss, body, sort)
     VALUES (?,?,?,?,?,?,?,?)`
  )
  let count = 0
  for (const { id, file } of LEXICON_FILES) {
    const path = await downloadCached(`lex_${id}.txt`, `${STEP_REPO}/${encodeURI(file)}`)
    const lines = readFileSync(path, 'utf8').split('\n')
    let sort = 0
    db.exec('BEGIN')
    for (const line of lines) {
      if (!/^[GH]\d/.test(line)) continue
      const c = line.split('\t')
      if (c.length < 8) continue
      const strongs = normStrongs(c[0])
      if (!strongs) continue
      const body = cleanLexBody(c[7] || '')
      if (!body) continue
      ins.run(
        id,
        strongs,
        (c[2] || c[0]).trim() || null,
        (c[3] || '').trim() || null,
        (c[4] || '').trim() || null,
        (c[6] || '').trim() || null,
        body,
        sort++
      )
      count++
    }
    db.exec('COMMIT')
  }
  return count
}

// ---- build -----------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(dirname(OUT), { recursive: true })
  for (const f of [OUT, `${OUT}-wal`, `${OUT}-shm`, `${OUT}-journal`]) {
    if (existsSync(f)) rmSync(f)
  }

  const db = new DatabaseSync(OUT)
  db.exec('PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF;')
  db.exec(readFileSync(SCHEMA, 'utf8'))

  // Books (canonical)
  const insBook = db.prepare(
    'INSERT INTO books (id, usfm, name, testament, sort_order, num_chapters) VALUES (?,?,?,?,?,?)'
  )
  db.exec('BEGIN')
  BOOKS.forEach((b, i) => insBook.run(b.id, b.usfm, b.name, b.testament, i + 1, b.chapters))
  db.exec('COMMIT')

  const insTrans = db.prepare(
    `INSERT INTO translations (id, abbrev, name, language, direction, is_original, has_strongs, license, attribution, sort_order)
     VALUES (?,?,?,?, 'ltr', 0, 0, ?, ?, ?)`
  )
  const insVerse = db.prepare(
    'INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?,?,?,?,?)'
  )
  const insFts = db.prepare(
    'INSERT INTO verses_fts (text, translation_id, book_id, chapter, verse) VALUES (?,?,?,?,?)'
  )

  const summary: { id: string; verses: number; chapters: number }[] = []

  for (const t of TRANSLATIONS) {
    process.stdout.write(`• ${t.id}: fetching…`)
    const data = await fetchJson<Complete>(
      `https://bible.helloao.org/api/${t.helloaoId}/complete.json`
    )
    insTrans.run(t.id, t.abbrev, t.name, 'eng', t.license, t.attribution, t.sortOrder)

    let verseCount = 0
    const chapterSet = new Set<string>()
    db.exec('BEGIN')
    for (const book of data.books) {
      const meta = BOOK_BY_USFM[book.id]
      if (!meta) continue // skip apocrypha / unknown books
      for (const wrap of book.chapters) {
        const ch = wrap.chapter
        chapterSet.add(`${meta.id}:${ch.number}`)
        // Accumulate text by verse number (a verse may span multiple blocks).
        const byVerse = new Map<number, string>()
        for (const block of ch.content) {
          if (block.type !== 'verse' || typeof block.number !== 'number' || !block.content) continue
          const text = verseText(block.content)
          if (!text) continue
          const prev = byVerse.get(block.number)
          byVerse.set(block.number, prev ? `${prev} ${text}` : text)
        }
        for (const [verse, text] of byVerse) {
          insVerse.run(t.id, meta.id, ch.number, verse, text)
          insFts.run(text, t.id, meta.id, ch.number, verse)
          verseCount++
        }
      }
    }
    db.exec('COMMIT')
    summary.push({ id: t.id, verses: verseCount, chapters: chapterSet.size })
    process.stdout.write(` ${verseCount} verses, ${chapterSet.size} chapters\n`)
  }

  // Julia Smith 1876 (scraped from studybible.info, cached)
  process.stdout.write('• Julia Smith: fetching')
  const jsVerses = await fetchJuliaSmith()
  insTrans.run(
    'JuliaSmith',
    'Smith',
    'Julia Smith (1876)',
    'eng',
    'Public Domain',
    'Julia E. Smith Parker Translation (1876). Public Domain. Text via studybible.info (Digital Bible Society).',
    4
  )
  const jsChapters = new Set<string>()
  db.exec('BEGIN')
  for (const v of jsVerses) {
    insVerse.run('JuliaSmith', v.book, v.chapter, v.verse, v.text)
    insFts.run(v.text, 'JuliaSmith', v.book, v.chapter, v.verse)
    jsChapters.add(`${v.book}:${v.chapter}`)
  }
  db.exec('COMMIT')
  summary.push({ id: 'Smith', verses: jsVerses.length, chapters: jsChapters.size })
  process.stdout.write(` ${jsVerses.length} verses, ${jsChapters.size} chapters\n`)

  // Strong's lexicon
  process.stdout.write('• Strong’s lexicon: fetching…')
  const insLex = db.prepare(
    `INSERT OR REPLACE INTO strongs_lexicon (id, language, lemma, translit, pronunciation, definition, kjv_def, derivation)
     VALUES (?,?,?,?,?,?,?,?)`
  )
  let lexCount = 0
  for (const [language, url] of Object.entries(STRONGS_SOURCES)) {
    const dict = parseDictJs(await (await fetch(url)).text())
    db.exec('BEGIN')
    for (const [id, e] of Object.entries(dict)) {
      insLex.run(
        id,
        language,
        e.lemma ?? null,
        e.translit ?? e.xlit ?? null,
        e.pron ?? null,
        e.strongs_def ?? null,
        e.kjv_def ?? null,
        e.derivation ?? null
      )
      lexCount++
    }
    db.exec('COMMIT')
  }
  process.stdout.write(` ${lexCount} entries\n`)

  // KJV word-level Strong's tagging → verse_tokens
  process.stdout.write('• KJV Strong’s tagging: fetching…')
  // books.json: { "books": [ {"Genesis":"Gen"}, {"Exodus":"Exo"}, ... ] } (canonical order)
  const booksMeta = await fetchJson<{ books: Record<string, string>[] }>(
    `${KJV_STRONGS_BASE}/books.json`
  )
  const abbrevs = booksMeta.books.map((o) => Object.values(o)[0])
  if (abbrevs.length !== 66) throw new Error(`kaiserlik books.json: expected 66, got ${abbrevs.length}`)

  const insTok = db.prepare(
    `INSERT OR REPLACE INTO verse_tokens (translation_id, book_id, chapter, verse, position, surface, trailer, strongs)
     VALUES ('KJV', ?, ?, ?, ?, ?, ?, ?)`
  )
  let tokenCount = 0
  db.exec('BEGIN')
  for (let i = 0; i < abbrevs.length; i++) {
    const ab = abbrevs[i]
    const myBook = BOOKS[i] // canonical order alignment
    // Some source files have unescaped quotes in non-English fields, so we
    // extract only the leading "en" value per verse by regex (never JSON.parse the file).
    const text = await (await fetch(`${KJV_STRONGS_BASE}/${ab}.json`)).text()
    const verseRe = new RegExp(
      `"${ab}\\|(\\d+)\\|(\\d+)"\\s*:\\s*\\{\\s*"en"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
      'g'
    )
    let m: RegExpExecArray | null
    while ((m = verseRe.exec(text)) !== null) {
      const chapter = Number(m[1])
      const verse = Number(m[2])
      let en: string
      try {
        en = JSON.parse(`"${m[3]}"`) as string
      } catch {
        continue
      }
      const toks = parseKjvTokens(en)
      toks.forEach((tk, pos) => {
        insTok.run(myBook.id, chapter, verse, pos, tk.surface, tk.trailer, tk.strongs)
        tokenCount++
      })
    }
  }
  db.exec('COMMIT')
  db.prepare('UPDATE translations SET has_strongs = 1 WHERE id = ?').run('KJV')
  // Report distinct stored rows (source has a few duplicated blocks that REPLACE, not add).
  tokenCount = (
    db.prepare("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='KJV'").get() as {
      n: number
    }
  ).n
  process.stdout.write(` ${tokenCount} tokens\n`)

  // Backfill divine-name tags the KJV Strong's source left blank. In the KJV OT, small-caps
  // LORD/GOD always render the Tetragrammaton (YHWH, and YHWH beside Adonai); tagging the gaps
  // makes every occurrence clickable for study and reachable by the Divine Names feature.
  const otBooks = "(SELECT id FROM books WHERE testament='OT')"
  const fixLord = db
    .prepare(
      `UPDATE verse_tokens SET strongs='H3068' WHERE translation_id='KJV' AND surface='LORD' AND strongs IS NULL AND book_id IN ${otBooks}`
    )
    .run()
  const fixGod = db
    .prepare(
      `UPDATE verse_tokens SET strongs='H3069' WHERE translation_id='KJV' AND surface='GOD' AND strongs IS NULL AND book_id IN ${otBooks}`
    )
    .run()
  process.stdout.write(
    `  divine-name backfill: LORD +${Number(fixLord.changes)}, GOD +${Number(fixGod.changes)}\n`
  )

  // BSB word-level Strong's + original-language alignment → verse_tokens
  process.stdout.write('• BSB interlinear tagging:')
  const bsbTokens = await tagBsb(db)
  process.stdout.write(` ${bsbTokens} tokens\n`)

  // Original-language editions (selectable interlinear bases)
  const insEdition = db.prepare(
    'INSERT OR REPLACE INTO editions (id, name, language, testament, sort_order) VALUES (?,?,?,?,?)'
  )
  for (const e of EDITIONS) insEdition.run(e.id, e.name, e.language, e.testament, e.sort)
  process.stdout.write('• Interlinear editions: Hebrew (Masoretic)…')
  const mtCount = await buildHebrewEdition(db)
  process.stdout.write(` ${mtCount} · Greek (TR/Byz/Critical)…`)
  const grcCount = await buildGreekEditions(db)
  process.stdout.write(` ${grcCount} · Septuagint (Swete)…`)
  const lxxCount = await buildSeptuagintEdition(db)
  process.stdout.write(` ${lxxCount}\n`)

  process.stdout.write('• Lexicons (BDB / Abbott-Smith / LSJ)…')
  const lexEntries = await buildLexicons(db)
  process.stdout.write(` ${lexEntries} entries\n`)

  const insMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)')
  insMeta.run('schema_version', '1')
  insMeta.run(
    'sources',
    'helloao Free Use Bible API; openscriptures/strongs (CC-BY-SA); kaiserlik/kjv (KJV+Strong’s); bereanbible.com bsb_tables (BSB interlinear, public domain); STEPBible TAHOT/TAGNT + lexicons TBESH/TBESG/TFLSJ (CC-BY); Septuagint: Swete via Open Greek and Latin / First1KGreek, nathans/lxx-swete (CC-BY-SA 4.0)'
  )

  // ---- assertions --------------------------------------------------------
  const errors: string[] = []
  const bookCount = (db.prepare('SELECT COUNT(*) n FROM books').get() as { n: number }).n
  if (bookCount !== 66) errors.push(`expected 66 books, got ${bookCount}`)

  for (const s of summary) {
    // Julia Smith is scraped and may have minor gaps; assert it more loosely.
    if (s.id === 'Smith') {
      if (s.verses < 28000) errors.push(`Julia Smith: only ${s.verses} verses (expected ~31k)`)
      continue
    }
    if (s.chapters < 1180 || s.chapters > 1200) errors.push(`${s.id}: ${s.chapters} chapters (expected ~1189)`)
    if (s.verses < 30000) errors.push(`${s.id}: only ${s.verses} verses`)
  }

  const jsJn = db
    .prepare("SELECT text FROM verses WHERE translation_id='JuliaSmith' AND book_id='John' AND chapter=1 AND verse=1")
    .get() as { text: string } | undefined
  if (!jsJn || !/God was the Word/i.test(jsJn.text)) {
    errors.push(`Julia Smith John 1:1 unexpected: ${jsJn?.text ?? '(missing)'}`)
  }

  const jn11 = db
    .prepare('SELECT text FROM verses WHERE translation_id=? AND book_id=? AND chapter=1 AND verse=1')
    .get('KJV', 'John') as { text: string } | undefined
  if (!jn11 || !/In the beginning was the Word/i.test(jn11.text)) {
    errors.push(`KJV John 1:1 unexpected: ${jn11?.text ?? '(missing)'}`)
  }

  const g26 = db.prepare('SELECT lemma, translit FROM strongs_lexicon WHERE id=?').get('G26') as
    | { lemma: string; translit: string }
    | undefined
  if (!g26 || !/ἀγάπη/.test(g26.lemma ?? '')) errors.push(`G26 lexicon missing/agapē: ${JSON.stringify(g26)}`)

  const fts = db
    .prepare("SELECT COUNT(*) n FROM verses_fts WHERE verses_fts MATCH 'love'")
    .get() as { n: number }
  if (fts.n < 100) errors.push(`FTS 'love' returned ${fts.n} (expected many)`)

  const kjvTokens = db
    .prepare("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='KJV'")
    .get() as { n: number }
  if (kjvTokens.n < 700000) errors.push(`KJV tokens only ${kjvTokens.n} (expected ~790k)`)
  const wordG3056 = db
    .prepare(
      "SELECT strongs FROM verse_tokens WHERE translation_id='KJV' AND book_id='John' AND chapter=1 AND verse=1 AND surface='Word'"
    )
    .get() as { strongs: string } | undefined
  if (wordG3056?.strongs !== 'G3056') {
    errors.push(`KJV John 1:1 'Word' should tag G3056, got ${JSON.stringify(wordG3056)}`)
  }

  const bsbCount = (
    db.prepare("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='BSB'").get() as {
      n: number
    }
  ).n
  if (bsbCount < 400000) errors.push(`BSB tokens only ${bsbCount} (expected ~430k)`)
  const bsbWord = db
    .prepare(
      "SELECT strongs, lemma FROM verse_tokens WHERE translation_id='BSB' AND book_id='John' AND chapter=1 AND verse=1 AND surface='Word'"
    )
    .get() as { strongs: string; lemma: string } | undefined
  if (bsbWord?.strongs !== 'G3056') {
    errors.push(`BSB John 1:1 'Word' should tag G3056, got ${JSON.stringify(bsbWord)}`)
  }
  const bsbGod = db
    .prepare(
      "SELECT strongs FROM verse_tokens WHERE translation_id='BSB' AND book_id='Gen' AND chapter=1 AND verse=1 AND surface='God'"
    )
    .get() as { strongs: string } | undefined
  if (bsbGod?.strongs !== 'H430') {
    errors.push(`BSB Gen 1:1 'God' should tag H430, got ${JSON.stringify(bsbGod)}`)
  }

  // Original-language editions
  const mtGen = db
    .prepare(
      "SELECT strongs FROM original_tokens WHERE edition='MT' AND book_id='Gen' AND chapter=1 AND verse=1 ORDER BY position LIMIT 1"
    )
    .get() as { strongs: string } | undefined
  if (mtGen?.strongs !== 'H7225') errors.push(`MT Gen 1:1 first word should be H7225, got ${JSON.stringify(mtGen)}`)

  const naJohn = db
    .prepare(
      "SELECT COUNT(*) n FROM original_tokens WHERE edition='NA' AND book_id='John' AND chapter=1 AND verse=1 AND strongs='G3056'"
    )
    .get() as { n: number }
  if (naJohn.n < 1) errors.push('NA John 1:1 should contain G3056 (λόγος)')

  // TR vs Critical must actually differ — the Comma Johanneum (1 John 5:7) is in TR, not NA.
  const trComma = (
    db.prepare("SELECT COUNT(*) n FROM original_tokens WHERE edition='TR' AND book_id='1John' AND chapter=5 AND verse=7").get() as { n: number }
  ).n
  const naComma = (
    db.prepare("SELECT COUNT(*) n FROM original_tokens WHERE edition='NA' AND book_id='1John' AND chapter=5 AND verse=7").get() as { n: number }
  ).n
  if (!(trComma > naComma)) errors.push(`TR 1John 5:7 (${trComma}) should have more words than NA (${naComma})`)

  // Septuagint (Swete): Gen 1:1 opens ἐν ἀρχῇ (transliterated en archē) and is a full OT edition.
  const lxxGen = db
    .prepare(
      "SELECT original, translit FROM original_tokens WHERE edition='LXX' AND book_id='Gen' AND chapter=1 AND verse=1 ORDER BY position LIMIT 2"
    )
    .all() as { original: string; translit: string }[]
  if (!/^ε[νἐ]/iu.test(lxxGen[0]?.original ?? '') || !/^αρχ/iu.test((lxxGen[1]?.original ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')))
    errors.push(`LXX Gen 1:1 should open ἐν ἀρχῇ, got ${JSON.stringify(lxxGen)}`)
  const lxxBooks = (
    db.prepare("SELECT COUNT(DISTINCT book_id) n FROM original_tokens WHERE edition='LXX'").get() as { n: number }
  ).n
  if (lxxBooks < 35) errors.push(`LXX should cover ≥35 OT books, got ${lxxBooks}`)

  // Lexicons: agapē (G26) has an Abbott-Smith (TBESG) entry; Elohim (H430) a BDB (TBESH) entry.
  const g26lex = (
    db.prepare("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='G26' AND lexicon='TBESG'").get() as { n: number }
  ).n
  if (g26lex < 1) errors.push('TBESG (Abbott-Smith) should have an entry for G26 (ἀγάπη)')
  const h430lex = (
    db.prepare("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='H430' AND lexicon='TBESH'").get() as { n: number }
  ).n
  if (h430lex < 1) errors.push('TBESH (BDB) should have an entry for H430 (אֱלֹהִים)')

  db.close()

  console.log('\n─ Summary ───────────────────────')
  for (const s of summary) console.log(`  ${s.id.padEnd(5)} ${s.verses} verses / ${s.chapters} chapters`)
  console.log(`  Strong's lexicon: ${lexCount} entries`)
  console.log(`  Output: ${OUT}`)
  if (errors.length) {
    console.error('\n✗ ASSERTIONS FAILED:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('✓ All assertions passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
