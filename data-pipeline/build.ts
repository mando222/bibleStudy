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
import { foldLatinHomoglyphs } from '../src/shared/originalText'
import {
  cleanLexBody,
  normGreek,
  normHebrew,
  normStrongs,
  retileTokens,
  translitGreek,
  type RawToken
} from './lib'

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
// line, prefixed `1.chapter.verse`. Protocanon books only (mapped to our 66-book canon). Esdras B
// (Ezra+Neh) is handled separately below (split into the two books). LXX-only deuterocanon is
// omitted; Ecclesiastes (Qoheleth) is absent from this digitisation and stays a gap until a clean
// (PD/CC-BY, non-CATSS) source is vetted. Daniel uses the Theodotion recension (standard editions).
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

// normStrongs moved to ./lib (unit-tested).

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
    // The KJV source marks paragraph starts with a pilcrow inside the verse content. It's
    // typography, not Scripture, and this reader flows verses inline — so ~3k KJV verses used to
    // begin with a stray "¶ ".
    .replace(/¶/g, ' ')
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

/**
 * Make `verses.text` authoritative for a tagged translation by re-tiling its verse_tokens onto the
 * real words of each verse (see retileTokens in ./lib).
 *
 * The word-level Strong's sources are third-party and imperfect — kaiserlik/kjv truncates the tail
 * of thousands of verses and prepends Psalm superscriptions, bereanbible's table carries alignment
 * markup — and the reader renders FROM these tokens whenever Strong's numbers or Quick Replace are
 * on. Without this step those defects become visible (and silently truncated) Scripture text.
 */
function reconcileVerseTokens(
  db: DatabaseSync,
  id: string
): { verses: number; repaired: number; untagged: number } {
  const texts = new Map<string, string>()
  for (const r of db
    .prepare('SELECT book_id, chapter, verse, text FROM verses WHERE translation_id = ?')
    .all(id) as { book_id: string; chapter: number; verse: number; text: string }[]) {
    texts.set(`${r.book_id}|${r.chapter}|${r.verse}`, r.text)
  }

  const byVerse = new Map<string, RawToken[]>()
  for (const r of db
    .prepare(
      `SELECT book_id, chapter, verse, surface, trailer, strongs, lemma, translit, morph, gloss
         FROM verse_tokens WHERE translation_id = ? ORDER BY book_id, chapter, verse, position`
    )
    .all(id) as Record<string, unknown>[]) {
    const key = `${r.book_id}|${r.chapter}|${r.verse}`
    let arr = byVerse.get(key)
    if (!arr) {
      arr = []
      byVerse.set(key, arr)
    }
    arr.push({
      surface: r.surface as string,
      trailer: (r.trailer as string) ?? ' ',
      strongs: (r.strongs as string) ?? null,
      lemma: (r.lemma as string) ?? null,
      translit: (r.translit as string) ?? null,
      morph: (r.morph as string) ?? null,
      gloss: (r.gloss as string) ?? null
    })
  }

  const ins = db.prepare(
    `INSERT INTO verse_tokens
       (translation_id, book_id, chapter, verse, position, surface, trailer, strongs, lemma, translit, morph, gloss)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  let repaired = 0
  let untagged = 0
  db.exec('BEGIN')
  db.prepare('DELETE FROM verse_tokens WHERE translation_id = ?').run(id)
  for (const [key, toks] of byVerse) {
    const text = texts.get(key)
    if (!text) continue // a tagged verse we don't actually carry — drop the orphan tokens
    const before = toks.map((t) => t.surface + t.trailer).join('')
    const tiled = retileTokens(text, toks)
    if (before !== tiled.map((t) => t.surface + t.trailer).join('')) repaired++
    const [book, ch, v] = key.split('|')
    tiled.forEach((t, pos) => {
      if (!t.strongs) untagged++
      ins.run(
        id,
        book,
        Number(ch),
        Number(v),
        pos,
        t.surface,
        t.trailer,
        t.strongs,
        t.lemma ?? null,
        t.translit ?? null,
        t.morph ?? null,
        t.gloss ?? null
      )
    })
  }
  db.exec('COMMIT')
  return { verses: byVerse.size, repaired, untagged }
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

/** Build the Masoretic (MT) Hebrew edition from TAHOT, capturing Ketiv/Qere variants. */
async function buildHebrewEdition(db: DatabaseSync): Promise<{ count: number; kq: number }> {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO original_tokens (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss)
     VALUES ('MT',?,?,?,?,?,?,?,?,?)`
  )
  // The Ketiv ("written") variant beside the Qere ("read") main text. TAHOT marks such words with a
  // `=Q(K)` type on the ref column (uppercase K = affects translation), and gives the Ketiv Hebrew
  // after a `;K=` marker in a later column.
  const kqIns = db.prepare(
    `INSERT OR REPLACE INTO ketiv_qere (book_id, chapter, verse, position, qere, ketiv, strongs, significant)
     VALUES (?,?,?,?,?,?,?,?)`
  )
  let count = 0
  let kq = 0
  for (const [name, url] of TAHOT_FILES) {
    const path = await downloadCached(name, url)
    const lines = readFileSync(path, 'utf8').split('\n')
    let curVerse = ''
    let pos = 0
    db.exec('BEGIN')
    for (const line of lines) {
      if (!STEP_ROW.test(line)) continue
      const c = line.split('\t')
      const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)#\d+(?:=(\S+))?/.exec(c[0])
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
      const position = pos
      ins.run(book, chapter, verse, position, original, translit, strongs, morph, gloss)
      count++

      // Ketiv/Qere? The type looks like Q(K), Q(k), or Q(K+B) — the letter case marks significance.
      // The Ketiv Hebrew appears in one of two TAHOT forms: "K= translit (Hebrew) …" (parens), or
      // ";K= Hebrew" (direct). Prefer the parens form; fall back to the direct one.
      const kqType = /^Q\(([Kk])/.exec(m[4] || '')
      if (kqType) {
        const paren = /[;\s]K=\s*[^\t(]*\(([^)]+)\)/.exec(line)
        const direct = /[;\s]K=\s*([^\t¦(]+)/.exec(line)
        const rawK = paren ? paren[1] : direct ? direct[1] : ''
        const ketiv = rawK.replace(/[/\\׃־]/g, '').replace(/\s+/g, '').trim()
        if (ketiv && ketiv !== original) {
          const qere = original.replace(/\\/g, '') // drop TAHOT's join separators for display
          kqIns.run(book, chapter, verse, position, qere, ketiv, strongs, kqType[1] === 'K' ? 1 : 0)
          kq++
        }
      }
      pos++
    }
    db.exec('COMMIT')
  }
  return { count, kq }
}

// Greek → Latin (SBL-style) transliteration. Deterministic study aid, not accent-perfect.
// translitGreek + GK moved to ./lib (unit-tested).

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

  // Esdras B (2 Esdras) = Ezra (chapters 1–10) + Nehemiah (chapters 11–23). Split it into our two
  // canonical books. Same CC-BY-SA source; just not a 1-file-per-book mapping.
  {
    const path = await downloadCached('lxx_18.Esdras_B.txt', `${LXX_BASE}/18.Esdras_B.txt`)
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
      const ch = Number(m[1])
      const verse = Number(m[2])
      const book = ch <= 10 ? 'Ezra' : 'Neh'
      const chapter = ch <= 10 ? ch : ch - 10
      const vk = `${book}.${chapter}.${verse}`
      if (vk !== curVerse) {
        curVerse = vk
        pos = 0
      }
      ins.run(book, chapter, verse, pos++, original, translitGreek(original), null, null, null)
      count++
    }
    db.exec('COMMIT')
  }
  return count
}

/**
 * Fold an original-language string for accent/point-insensitive search: decompose, drop Greek
 * accents + Hebrew points/cantillation, lowercase, and unify final sigma. The readable text keeps
 * its accents; only the (invisible) FTS index is folded, so a query like "θεος" finds "θεὸς".
 */
export function foldOriginal(s: string): string {
  return foldLatinHomoglyphs(s)
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
}

/**
 * Make the original-language editions (Masoretic Hebrew, Septuagint Greek) readable + searchable:
 * assemble verse text from their `original_tokens` words and load them into translations/verses/FTS
 * so they appear in the translation picker, work as parallel columns, and are full-text searchable.
 */
function buildOriginalReadingEditions(db: DatabaseSync): { id: string; verses: number }[] {
  const defs = [
    {
      id: 'MT',
      abbrev: 'WLC',
      name: 'Masoretic Hebrew (WLC)',
      language: 'hbo',
      direction: 'rtl',
      license: 'CC BY 4.0',
      attribution: 'STEPBible TAHOT (Tyndale House) — Westminster Leningrad Codex tradition.',
      sort: 40
    },
    {
      id: 'LXX',
      abbrev: 'LXX',
      name: 'Septuagint (Swete)',
      language: 'grc',
      direction: 'ltr',
      license: 'CC BY-SA 4.0',
      attribution: "Swete's Septuagint via Open Greek and Latin / First1KGreek (nathans/lxx-swete).",
      sort: 41
    }
  ]
  const insTrans = db.prepare(
    `INSERT OR REPLACE INTO translations (id, abbrev, name, language, direction, is_original, has_strongs, license, attribution, sort_order)
     VALUES (?,?,?,?,?,1,0,?,?,?)`
  )
  const insVerse = db.prepare(
    'INSERT OR REPLACE INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?,?,?,?,?)'
  )
  const insFts = db.prepare(
    'INSERT INTO verses_fts (text, translation_id, book_id, chapter, verse) VALUES (?,?,?,?,?)'
  )
  const out: { id: string; verses: number }[] = []
  for (const d of defs) {
    insTrans.run(d.id, d.abbrev, d.name, d.language, d.direction, d.license, d.attribution, d.sort)
    const rows = db
      .prepare(
        `SELECT book_id AS b, chapter AS c, verse AS v, original AS w FROM original_tokens
         WHERE edition = ? ORDER BY book_id, chapter, verse, position`
      )
      .all(d.id) as { b: string; c: number; v: number; w: string }[]
    let verses = 0
    let cur: { b: string; c: number; v: number } | null = null
    let words: string[] = []
    const flush = (): void => {
      if (cur && words.length) {
        const text = words.join(' ')
        insVerse.run(d.id, cur.b, cur.c, cur.v, text) // readable text keeps its accents/points
        insFts.run(foldOriginal(text), d.id, cur.b, cur.c, cur.v) // search index is accent-folded
        verses++
      }
    }
    db.exec('BEGIN')
    for (const r of rows) {
      if (!cur || r.b !== cur.b || r.c !== cur.c || r.v !== cur.v) {
        flush()
        cur = { b: r.b, c: r.c, v: r.v }
        words = []
      }
      words.push(r.w.replace(/\\/g, '')) // drop TAHOT's join separators from readable text
    }
    flush()
    db.exec('COMMIT')
    out.push({ id: d.id, verses })
  }
  return out
}

/** Sanitise a STEPBible lexicon body to a safe subset: only <b>/<i> tags + newlines. */
// cleanLexBody moved to ./lib (unit-tested).

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

// normGreek + normHebrew moved to ./lib (unit-tested).

/**
 * Scripture-attested parses: for every original-language form, collect the distinct analyses it
 * receives across the SCHOLAR-tagged editions (Greek: NA/TR/BYZ = STEPBible TAGNT; Hebrew: MT =
 * TAHOT). Only human scholarship — never the derived LXX/KJV tags — so the "all parses" view
 * surfaces real, attested readings, not machine guesses.
 */
function buildFormParses(db: DatabaseSync): number {
  const agg = new Map<
    string,
    { form: string; lang: string; strongs: string | null; morph: string | null; gloss: string | null; count: number }
  >()
  const collect = (lang: 'greek' | 'hebrew', norm: (s: string) => string, sql: string): void => {
    for (const r of db.prepare(sql).all() as {
      original: string
      strongs: string | null
      morph: string | null
      gloss: string | null
    }[]) {
      const form = norm(r.original)
      if (!form || (!r.strongs && !r.morph)) continue
      const key = `${form} ${lang} ${r.strongs ?? ''} ${r.morph ?? ''}`
      let e = agg.get(key)
      if (!e) {
        e = { form, lang, strongs: r.strongs ?? null, morph: r.morph ?? null, gloss: r.gloss ?? null, count: 0 }
        agg.set(key, e)
      }
      e.count++
      if (!e.gloss && r.gloss) e.gloss = r.gloss
    }
  }
  collect('greek', normGreek, "SELECT original, strongs, morph, gloss FROM original_tokens WHERE edition IN ('NA','TR','BYZ')")
  collect('hebrew', normHebrew, "SELECT original, strongs, morph, gloss FROM original_tokens WHERE edition = 'MT'")
  const ins = db.prepare('INSERT INTO form_parses (form, lang, strongs, morph, gloss, count) VALUES (?,?,?,?,?,?)')
  db.exec('BEGIN')
  for (const e of agg.values()) ins.run(e.form, e.lang, e.strongs, e.morph, e.gloss, e.count)
  db.exec('COMMIT')
  return agg.size
}

/**
 * LXX Phase 2 — tag the Septuagint from our OWN data, no CATSS. Build a surface→Strong's map from
 * the already-loaded tagged NT Greek (NA/TR/BYZ) and match LXX word forms against it; shared
 * vocabulary gets Strong's + lemma + morph + gloss, LXX-only words stay untagged.
 */
function tagSeptuagint(db: DatabaseSync): { tagged: number; total: number } {
  const ntRows = db
    .prepare(
      "SELECT original, strongs, morph, gloss FROM original_tokens WHERE edition IN ('NA','TR','BYZ') AND strongs LIKE 'G%'"
    )
    .all() as { original: string; strongs: string; morph: string | null; gloss: string | null }[]
  // surface → (strongs → {count, morph, gloss}); we keep the most frequent Strong's per form.
  const forms = new Map<string, Map<string, { count: number; morph: string | null; gloss: string | null }>>()
  for (const r of ntRows) {
    const k = normGreek(r.original)
    if (!k) continue
    let m = forms.get(k)
    if (!m) {
      m = new Map()
      forms.set(k, m)
    }
    const e = m.get(r.strongs) ?? { count: 0, morph: r.morph, gloss: r.gloss }
    e.count++
    m.set(r.strongs, e)
  }
  const best = new Map<string, { strongs: string; morph: string | null; gloss: string | null }>()
  for (const [k, m] of forms) {
    let pick = { strongs: '', count: -1, morph: null as string | null, gloss: null as string | null }
    for (const [s, e] of m) if (e.count > pick.count) pick = { strongs: s, count: e.count, morph: e.morph, gloss: e.gloss }
    best.set(k, { strongs: pick.strongs, morph: pick.morph, gloss: pick.gloss })
  }
  // original_tokens has no lemma column — the dictionary lemma comes from the Strong's lexicon on
  // click. We fill strongs (→ lexicon), plus morph and gloss carried over from the matched NT form.
  const lxx = db
    .prepare("SELECT book_id, chapter, verse, position, original FROM original_tokens WHERE edition='LXX'")
    .all() as { book_id: string; chapter: number; verse: number; position: number; original: string }[]
  const upd = db.prepare(
    "UPDATE original_tokens SET strongs=?, morph=?, gloss=? WHERE edition='LXX' AND book_id=? AND chapter=? AND verse=? AND position=?"
  )
  let tagged = 0
  db.exec('BEGIN')
  for (const t of lxx) {
    const b = best.get(normGreek(t.original))
    if (!b) continue
    upd.run(b.strongs, b.morph, b.gloss, t.book_id, t.chapter, t.verse, t.position)
    tagged++
  }
  db.exec('COMMIT')
  return { tagged, total: lxx.length }
}

/**
 * People / places / events for the Genealogies, Maps, and Timelines views, from the Theographic
 * Bible Metadata knowledge graph (CC-BY-SA 4.0). Each entity's verse references are resolved to our
 * "Book.ch.v" keys via each verse record's OSIS ref, so everything links straight into the reader.
 */
async function buildTheographic(
  db: DatabaseSync
): Promise<{ people: number; places: number; events: number }> {
  const BASE =
    'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json'
  type Rec = { id: string; fields: Record<string, unknown> }
  const load = async (name: string): Promise<Rec[]> =>
    JSON.parse(readFileSync(await downloadCached(`theo_${name}.json`, `${BASE}/${name}.json`), 'utf8'))

  const [people, places, events, verses] = await Promise.all([
    load('people'),
    load('places'),
    load('events'),
    load('verses')
  ])

  const num = (x: unknown): number | null => {
    const n = Number(x)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }
  const flt = (x: unknown): number | null => {
    const n = Number(x)
    return Number.isFinite(n) ? n : null
  }
  const validBooks = new Set(BOOKS.map((b) => b.id)) // our ids are OSIS-style — match directly

  // verse record id → "Book.ch.v"
  const vref = new Map<string, string>()
  for (const v of verses) {
    const osis = v.fields.osisRef as string | undefined
    const m = osis && /^([^.]+)\.(\d+)\.(\d+)$/.exec(osis)
    if (!m || !validBooks.has(m[1])) continue
    vref.set(v.id, `${m[1]}.${Number(m[2])}.${Number(m[3])}`)
  }
  const resolveVerses = (recs: unknown): string[] => [
    ...new Set(((recs as string[]) || []).map((r) => vref.get(r)).filter(Boolean) as string[])
  ]
  const personIdByRec = new Map(people.map((p) => [p.id, p.fields.personID as number]))
  const placeIdByRec = new Map(places.map((p) => [p.id, p.fields.placeID as number]))
  const first = (a: unknown): string | undefined => (a as string[] | undefined)?.[0]

  // Parse a Theographic duration like "930Y", "7D", "3M" into whole years (0 for < 1 year).
  const durationYears = (d: unknown): number => {
    const m = /(\d+)\s*([YMD])/i.exec(String(d ?? ''))
    if (!m) return 0
    const n = Number(m[1])
    const unit = m[2].toUpperCase()
    return unit === 'Y' ? n : unit === 'M' ? Math.floor(n / 12) : 0
  }

  // Per-record year signals used to derive place active-windows + event end-years.
  const birthByRec = new Map<string, number | null>(people.map((p) => [p.id, num(p.fields.birthYear)]))
  const deathByRec = new Map<string, number | null>(people.map((p) => [p.id, num(p.fields.deathYear)]))
  const eventStartByRec = new Map<string, number | null>()
  const eventEndByRec = new Map<string, number | null>()
  for (const ev of events) {
    const start = num(ev.fields.startDate)
    eventStartByRec.set(ev.id, start)
    const ranged = !!ev.fields.rangeFlag
    eventEndByRec.set(ev.id, start != null && ranged ? start + durationYears(ev.fields.duration) : start)
  }
  // Derive a place's [start,end] active-window from associated events + people born/died there.
  const placeWindow = (f: Record<string, unknown>): { start: number | null; end: number | null } => {
    const ys: number[] = []
    for (const r of (f.eventsHere as string[]) || []) {
      const s = eventStartByRec.get(r)
      const e = eventEndByRec.get(r)
      if (s != null) ys.push(s)
      if (e != null) ys.push(e)
    }
    for (const r of (f.peopleBorn as string[]) || []) {
      const b = birthByRec.get(r)
      if (b != null) ys.push(b)
    }
    for (const r of (f.peopleDied as string[]) || []) {
      const d = deathByRec.get(r)
      if (d != null) ys.push(d)
    }
    return ys.length ? { start: Math.min(...ys), end: Math.max(...ys) } : { start: null, end: null }
  }

  // People + relationships
  const insP = db.prepare(
    `INSERT OR REPLACE INTO people (id,name,gender,birth_year,death_year,father_id,mother_id,slug,summary,verse_count,verses)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
  const insL = db.prepare('INSERT INTO person_links (person_id, related_id, kind) VALUES (?,?,?)')
  db.exec('BEGIN')
  for (const p of people) {
    const f = p.fields
    const id = f.personID as number | undefined
    if (id == null) continue
    const vs = resolveVerses(f.verses)
    const summary = ((f.dictionaryText as string) || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    insP.run(
      id,
      (f.name as string) || (f.displayTitle as string) || `Person ${id}`,
      (f.gender as string) || null,
      num(f.birthYear),
      num(f.deathYear),
      personIdByRec.get(first(f.father) ?? '') ?? null,
      personIdByRec.get(first(f.mother) ?? '') ?? null,
      (f.slug as string) || null,
      summary || null,
      vs.length,
      JSON.stringify(vs)
    )
    for (const c of (f.children as string[]) || []) {
      const rid = personIdByRec.get(c)
      if (rid != null) insL.run(id, rid, 'child')
    }
    for (const s of (f.partners as string[]) || []) {
      const rid = personIdByRec.get(s)
      if (rid != null) insL.run(id, rid, 'spouse')
    }
  }
  db.exec('COMMIT')

  // Places (with a derived active year-window)
  const insPl = db.prepare(
    `INSERT OR REPLACE INTO places (id,name,lat,lon,feature_type,comment,verse_count,verses,start_year,end_year)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  )
  db.exec('BEGIN')
  for (const pl of places) {
    const f = pl.fields
    const id = f.placeID as number | undefined
    if (id == null) continue
    const vs = resolveVerses(f.verses)
    const win = placeWindow(f)
    insPl.run(
      id,
      (f.kjvName as string) || (f.esvName as string) || (f.placeLookup as string) || `Place ${id}`,
      flt(f.openBibleLat ?? f.latitude),
      flt(f.openBibleLong ?? f.longitude),
      (f.featureType as string) || null,
      ((f.comment as string) || '').slice(0, 200) || null,
      vs.length,
      JSON.stringify(vs),
      win.start,
      win.end
    )
  }
  db.exec('COMMIT')

  // Events (with a derived end-year for ranged events)
  const insE = db.prepare(
    `INSERT OR REPLACE INTO events (id,title,start_year,end_year,sort_key,participants,place_ids,verses)
     VALUES (?,?,?,?,?,?,?,?)`
  )
  db.exec('BEGIN')
  for (const ev of events) {
    const f = ev.fields
    const id = f.eventID as number | undefined
    if (id == null) continue
    const parts = [
      ...new Set(((f.participants as string[]) || []).map((r) => personIdByRec.get(r)).filter((x) => x != null))
    ]
    const plcs = [
      ...new Set(((f.locations as string[]) || []).map((r) => placeIdByRec.get(r)).filter((x) => x != null))
    ]
    insE.run(
      id,
      (f.title as string) || `Event ${id}`,
      num(f.startDate),
      eventEndByRec.get(ev.id) ?? null,
      flt(f.sortKey) ?? num(f.startDate) ?? 0,
      JSON.stringify(parts),
      JSON.stringify(plcs),
      JSON.stringify(resolveVerses(f.verses))
    )
  }
  db.exec('COMMIT')

  return { people: people.length, places: places.length, events: events.length }
}

/** Natural Earth land polygons (public domain) for the offline Maps basemap, stored in `meta`. */
async function buildMapLand(db: DatabaseSync): Promise<number> {
  const path = await downloadCached(
    'ne_50m_land.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson'
  )
  const text = readFileSync(path, 'utf8')
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('land_geojson', ?)").run(text)
  return text.length
}

/** Hand-authored, approximate kingdoms/regions overlay (checked-in source, MIT/CC0), stored in meta. */
function buildMapRegions(db: DatabaseSync): number {
  const path = join(HERE, 'assets', 'regions.geojson')
  if (!existsSync(path)) return 0
  const text = readFileSync(path, 'utf8')
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('regions_geojson', ?)").run(text)
  return text.length
}

/** Cross-references (Treasury of Scripture Knowledge via OpenBible.info, CC-BY). Best-effort. */
async function buildCrossReferences(db: DatabaseSync): Promise<number> {
  const validBooks = new Set(BOOKS.map((b) => b.id))
  const parseRef = (s: string): { book: string; ch: number; v: number } | null => {
    const m = /^([^.]+)\.(\d+)\.(\d+)$/.exec(s.trim())
    return m && validBooks.has(m[1]) ? { book: m[1], ch: Number(m[2]), v: Number(m[3]) } : null
  }
  let path: string
  try {
    path = await downloadCached(
      'cross_references.txt',
      'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/sources/extras/cross_references.txt'
    )
  } catch (e) {
    console.warn(`  cross-references skipped (download failed): ${(e as Error).message}`)
    return 0
  }
  const ins = db.prepare(
    `INSERT INTO cross_references (from_book,from_chapter,from_verse,to_book,to_chapter,to_verse_start,to_verse_end,votes)
     VALUES (?,?,?,?,?,?,?,?)`
  )
  const lines = readFileSync(path, 'utf8').split('\n')
  let n = 0
  db.exec('BEGIN')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const [fromRef, toRef, votesStr] = line.split('\t')
    if (!fromRef || !toRef) continue
    const from = parseRef(fromRef)
    if (!from) continue
    const [toStart, toEnd] = toRef.split('-')
    const ts = parseRef(toStart)
    if (!ts) continue
    let endV: number | null = null
    if (toEnd) {
      const te = parseRef(toEnd)
      if (te && te.book === ts.book && te.ch === ts.ch) endV = te.v
    }
    ins.run(from.book, from.ch, from.v, ts.book, ts.ch, ts.v, endV, Number(votesStr) || 0)
    n++
  }
  db.exec('COMMIT')
  return n
}

/** Frequency-ranked vocabulary for the Learn tab, from the tagged Greek NT (NA) + Hebrew OT (MT). */
function buildVocab(db: DatabaseSync): number {
  const clean = (g: string | null): string | null => {
    if (!g) return null
    return (
      g
        .replace(/<[^>]+>/g, '')
        .split(/[;,]/)[0]
        .replace(/^\s*\d+[).]\s*/, '')
        .trim()
        .slice(0, 60) || null
    )
  }
  const rows = db
    .prepare(
      `SELECT ot.strongs AS strongs, COUNT(*) AS freq, sl.lemma AS lemma, sl.translit AS translit,
              sl.kjv_def AS kjv, sl.definition AS def
       FROM original_tokens ot LEFT JOIN strongs_lexicon sl ON sl.id = ot.strongs
       WHERE ot.edition IN ('NA','MT') AND ot.strongs IS NOT NULL AND ot.strongs != ''
       GROUP BY ot.strongs`
    )
    .all() as {
    strongs: string
    freq: number
    lemma: string | null
    translit: string | null
    kjv: string | null
    def: string | null
  }[]
  const ins = db.prepare(
    `INSERT OR REPLACE INTO vocab (strongs,language,lemma,translit,gloss,frequency,testament)
     VALUES (?,?,?,?,?,?,?)`
  )
  let n = 0
  db.exec('BEGIN')
  for (const r of rows) {
    if (!/^[GH]\d+$/.test(r.strongs)) continue // skip compound/irregular tags
    const greek = r.strongs.startsWith('G')
    ins.run(
      r.strongs,
      greek ? 'greek' : 'hebrew',
      r.lemma || r.strongs,
      r.translit,
      clean(r.kjv) ?? clean(r.def),
      r.freq,
      greek ? 'NT' : 'OT'
    )
    n++
  }
  db.exec('COMMIT')
  return n
}

/** Original "read real Greek/Hebrew early" courses (our own text; readings reference the tagged text). */
function buildGrammar(db: DatabaseSync): number {
  type Lesson = {
    chapter_no: number
    title: string
    body_md: string
    vocab?: { lemma: string; gloss: string }[]
    readings?: { ref: string; note?: string }[]
    exercises?: { prompt: string; answer: string }[]
  }
  const courses: { course: string; file: string }[] = [
    { course: 'koine', file: 'greek-course.json' },
    { course: 'hebrew', file: 'hebrew-course.json' }
  ]
  const ins = db.prepare(
    `INSERT OR REPLACE INTO grammar_lessons (id,course,chapter_no,title,body_md,vocab_json,readings_json,exercises_json,sort)
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
  let id = 0
  db.exec('BEGIN')
  for (const c of courses) {
    const path = join(HERE, 'assets', c.file)
    if (!existsSync(path)) continue
    const lessons = JSON.parse(readFileSync(path, 'utf8')) as Lesson[]
    for (const l of lessons) {
      id++
      ins.run(
        id,
        c.course,
        l.chapter_no,
        l.title,
        l.body_md,
        JSON.stringify(l.vocab ?? []),
        JSON.stringify(l.readings ?? []),
        JSON.stringify(l.exercises ?? []),
        id
      )
    }
  }
  db.exec('COMMIT')
  return id
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

  // BSB word-level Strong's + original-language alignment → verse_tokens
  process.stdout.write('• BSB interlinear tagging:')
  const bsbTokens = await tagBsb(db)
  process.stdout.write(` ${bsbTokens} tokens\n`)

  // Re-tile both tagged translations onto their real verse text, so the reader can never show
  // truncated Scripture or tagger markup. Runs before the divine-name backfill below, so words
  // the taggers dropped are restored first and then get tagged like any other.
  process.stdout.write('• reconciling tokens to verse text:')
  for (const id of ['KJV', 'BSB']) {
    const r = reconcileVerseTokens(db, id)
    process.stdout.write(` ${id} ${r.repaired}/${r.verses} verses repaired`)
  }
  process.stdout.write('\n')

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

  // Original-language editions (selectable interlinear bases)
  const insEdition = db.prepare(
    'INSERT OR REPLACE INTO editions (id, name, language, testament, sort_order) VALUES (?,?,?,?,?)'
  )
  for (const e of EDITIONS) insEdition.run(e.id, e.name, e.language, e.testament, e.sort)
  process.stdout.write('• Interlinear editions: Hebrew (Masoretic)…')
  const mt = await buildHebrewEdition(db)
  process.stdout.write(` ${mt.count} (+${mt.kq} Ketiv/Qere) · Greek (TR/Byz/Critical)…`)
  const grcCount = await buildGreekEditions(db)
  process.stdout.write(` ${grcCount} · Septuagint (Swete + Esdras B)…`)
  const lxxCount = await buildSeptuagintEdition(db)
  process.stdout.write(` ${lxxCount}\n`)

  process.stdout.write('• LXX tagging (surface-match vs NT Greek, no CATSS)…')
  const lxxTag = tagSeptuagint(db)
  process.stdout.write(
    ` ${lxxTag.tagged}/${lxxTag.total} words (${Math.round((100 * lxxTag.tagged) / lxxTag.total)}%)\n`
  )

  process.stdout.write('• Readable originals (Masoretic + Septuagint → verses + search)…')
  const origRead = buildOriginalReadingEditions(db)
  process.stdout.write(` ${origRead.map((o) => `${o.id} ${o.verses}`).join(' · ')}\n`)

  process.stdout.write('• Lexicons (BDB / Abbott-Smith / LSJ)…')
  const lexEntries = await buildLexicons(db)
  process.stdout.write(` ${lexEntries} entries\n`)

  process.stdout.write('• Scripture-attested parses (scholar-tagged)…')
  const parseCount = buildFormParses(db)
  process.stdout.write(` ${parseCount} form-analyses\n`)

  process.stdout.write('• Theographic (people / places / events → Genealogies, Maps, Timelines)…')
  const theo = await buildTheographic(db)
  process.stdout.write(` ${theo.people} people · ${theo.places} places · ${theo.events} events\n`)

  process.stdout.write('• Map basemap (Natural Earth land, public domain)…')
  const landBytes = await buildMapLand(db)
  process.stdout.write(` ${Math.round(landBytes / 1024)} KB\n`)

  process.stdout.write('• Map regions (hand-authored kingdoms overlay)…')
  const regionBytes = buildMapRegions(db)
  process.stdout.write(` ${Math.round(regionBytes / 1024)} KB\n`)

  process.stdout.write('• Cross-references (Treasury of Scripture Knowledge, OpenBible CC-BY)…')
  const xrefCount = await buildCrossReferences(db)
  process.stdout.write(` ${xrefCount} links\n`)

  process.stdout.write('• Vocabulary (frequency-ranked, from tagged NA + MT)…')
  const vocabCount = buildVocab(db)
  process.stdout.write(` ${vocabCount} words\n`)

  process.stdout.write('• Greek grammar course (read-early lessons, original)…')
  const grammarCount = buildGrammar(db)
  process.stdout.write(` ${grammarCount} lessons\n`)

  const insMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)')
  insMeta.run('schema_version', '1')
  insMeta.run(
    'sources',
    'helloao Free Use Bible API; openscriptures/strongs (CC-BY-SA); kaiserlik/kjv (KJV+Strong’s); bereanbible.com bsb_tables (BSB interlinear, public domain); STEPBible TAHOT/TAGNT + lexicons TBESH/TBESG/TFLSJ (CC-BY); Septuagint: Swete via Open Greek and Latin / First1KGreek, nathans/lxx-swete (CC-BY-SA 4.0); Theographic Bible Metadata (people/places/events, CC-BY-SA 4.0); Natural Earth land (public domain); Treasury of Scripture Knowledge cross-references via OpenBible.info (CC-BY); hand-authored kingdoms overlay (this project, CC0); Greek grammar course authored for this project, readings rendered from the tagged Greek NT (Nestle 1904 PD / STEPBible CC-BY)'
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

  const pilcrow = db.prepare("SELECT COUNT(*) n FROM verses WHERE text LIKE '%¶%'").get() as {
    n: number
  }
  if (pilcrow.n > 0) errors.push(`${pilcrow.n} verses still carry a ¶ paragraph marker`)

  // The reader renders FROM verse_tokens when Strong's numbers / Quick Replace are on, so the
  // tokens of every tagged verse must reconstruct that verse's text EXACTLY — no truncated tails,
  // no tagger markup. This is the gate for the reconcile step above.
  for (const id of ['KJV', 'BSB']) {
    const mismatched = db
      .prepare(
        `SELECT COUNT(*) n FROM (
           SELECT t.book_id, t.chapter, t.verse
             FROM verse_tokens t
             JOIN verses v ON v.translation_id = t.translation_id AND v.book_id = t.book_id
                          AND v.chapter = t.chapter AND v.verse = t.verse
            WHERE t.translation_id = ?
            GROUP BY t.book_id, t.chapter, t.verse
           HAVING group_concat(t.surface || t.trailer, '') != v.text
         )`
      )
      .get(id) as { n: number }
    if (mismatched.n > 0) {
      errors.push(`${id}: ${mismatched.n} verses whose tokens do not reconstruct verses.text`)
    }
  }

  const bsbCount = (
    db.prepare("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='BSB'").get() as {
      n: number
    }
  ).n
  // ~386k after reconciliation: multi-word runs merge into one token and markup-only tokens
  // (". . .", "{}") are dropped, so this sits below the ~411k the raw tagger emits.
  if (bsbCount < 360000) errors.push(`BSB tokens only ${bsbCount} (expected ~386k)`)
  const bsbTagged = (
    db
      .prepare("SELECT COUNT(*) n FROM verse_tokens WHERE translation_id='BSB' AND strongs IS NOT NULL")
      .get() as { n: number }
  ).n
  if (bsbTagged < bsbCount * 0.9) {
    errors.push(`BSB only ${bsbTagged}/${bsbCount} tokens tagged — reconciliation lost alignment`)
  }
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
  if (lxxBooks < 37) errors.push(`LXX should cover ≥37 OT books, got ${lxxBooks}`)
  // Phase-2 tagging: θεὸς in LXX Gen 1:1 should carry God's Strong's number (G2316).
  const lxxTheos = db
    .prepare(
      "SELECT strongs FROM original_tokens WHERE edition='LXX' AND book_id='Gen' AND chapter=1 AND verse=1 AND original LIKE 'θε%' LIMIT 1"
    )
    .get() as { strongs: string | null } | undefined
  if (lxxTheos?.strongs !== 'G2316') errors.push(`LXX Gen 1:1 θεός should tag G2316, got ${JSON.stringify(lxxTheos)}`)
  const lxxTagged = (
    db.prepare("SELECT COUNT(*) n FROM original_tokens WHERE edition='LXX' AND strongs IS NOT NULL").get() as { n: number }
  ).n
  if (lxxTagged < 100000) errors.push(`LXX tagging too sparse: ${lxxTagged} words`)

  // Esdras B split → Ezra + Nehemiah now present in the LXX.
  for (const b of ['Ezra', 'Neh']) {
    const n = (
      db.prepare("SELECT COUNT(*) n FROM original_tokens WHERE edition='LXX' AND book_id=?").get(b) as {
        n: number
      }
    ).n
    if (n < 100) errors.push(`LXX ${b} (from Esdras B) too sparse: ${n} words`)
  }
  // OT Ketiv/Qere apparatus captured from TAHOT.
  const kqCount = (db.prepare('SELECT COUNT(*) n FROM ketiv_qere').get() as { n: number }).n
  if (kqCount < 1000) errors.push(`ketiv_qere too sparse: ${kqCount} (expected >1000)`)
  // Masoretic + Septuagint are readable (loaded into verses + FTS).
  for (const id of ['MT', 'LXX']) {
    const n = (db.prepare('SELECT COUNT(*) n FROM verses WHERE translation_id=?').get(id) as {
      n: number
    }).n
    if (n < 20000) errors.push(`${id} readable verses too few: ${n}`)
  }

  // Lexicons: agapē (G26) has an Abbott-Smith (TBESG) entry; Elohim (H430) a BDB (TBESH) entry.
  const g26lex = (
    db.prepare("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='G26' AND lexicon='TBESG'").get() as { n: number }
  ).n
  if (g26lex < 1) errors.push('TBESG (Abbott-Smith) should have an entry for G26 (ἀγάπη)')
  const h430lex = (
    db.prepare("SELECT COUNT(*) n FROM lexicon_entries WHERE strongs='H430' AND lexicon='TBESH'").get() as { n: number }
  ).n
  if (h430lex < 1) errors.push('TBESH (BDB) should have an entry for H430 (Elohim)')

  // Scripture-attested parses exist and capture real ambiguity (χάριν = noun χάρις AND prep χάριν).
  const parseTotal = (db.prepare('SELECT COUNT(*) n FROM form_parses').get() as { n: number }).n
  if (parseTotal < 50000) errors.push(`form_parses too sparse: ${parseTotal}`)
  const charinParses = (
    db.prepare("SELECT COUNT(DISTINCT strongs) n FROM form_parses WHERE form='χαριν' AND lang='greek'").get() as { n: number }
  ).n
  if (charinParses < 2) errors.push(`χάριν should have ≥2 attested parses, got ${charinParses}`)

  // Theographic: people/places/events loaded, with verse references resolved to our canon.
  const peopleN = (db.prepare('SELECT COUNT(*) n FROM people').get() as { n: number }).n
  if (peopleN < 2000) errors.push(`people too few: ${peopleN} (expected ~3000)`)
  const placesGeo = (db.prepare('SELECT COUNT(*) n FROM places WHERE lat IS NOT NULL').get() as { n: number }).n
  if (placesGeo < 500) errors.push(`geolocated places too few: ${placesGeo}`)
  const eventsN = (db.prepare('SELECT COUNT(*) n FROM events').get() as { n: number }).n
  if (eventsN < 100) errors.push(`events too few: ${eventsN}`)
  const land = (db.prepare("SELECT length(value) n FROM meta WHERE key='land_geojson'").get() as
    | { n: number }
    | undefined)?.n
  if (!land || land < 50000) errors.push(`map land geojson missing/small: ${land}`)
  // Moses (a well-known person) resolves to many verse references in our Book.ch.v form.
  const moses = db
    .prepare("SELECT verses FROM people WHERE name = 'Moses' ORDER BY verse_count DESC LIMIT 1")
    .get() as { verses: string } | undefined
  const mosesVerses = moses ? (JSON.parse(moses.verses) as string[]) : []
  if (mosesVerses.length < 100 || !/^[A-Za-z0-9]+\.\d+\.\d+$/.test(mosesVerses[0] ?? ''))
    errors.push(`Moses verse refs unexpected: ${mosesVerses.length}, first=${mosesVerses[0]}`)

  // v0.1.2: derived place windows, vocabulary, and grammar are present.
  const placeWin = (
    db.prepare('SELECT COUNT(*) n FROM places WHERE start_year IS NOT NULL').get() as { n: number }
  ).n
  if (placeWin < 50) errors.push(`places with a derived year-window too few: ${placeWin}`)
  const vocabN = (db.prepare('SELECT COUNT(*) n FROM vocab').get() as { n: number }).n
  if (vocabN < 3000) errors.push(`vocab too few: ${vocabN} (expected thousands)`)
  const greekVocab = (
    db.prepare("SELECT COUNT(*) n FROM vocab WHERE language='greek'").get() as { n: number }
  ).n
  if (greekVocab < 1000) errors.push(`greek vocab too few: ${greekVocab}`)
  // Cross-references are best-effort (network); assert format only when present.
  const xrefN = (db.prepare('SELECT COUNT(*) n FROM cross_references').get() as { n: number }).n
  if (xrefN > 0) {
    const jn316 = (
      db
        .prepare(
          "SELECT COUNT(*) n FROM cross_references WHERE from_book='John' AND from_chapter=3 AND from_verse=16"
        )
        .get() as { n: number }
    ).n
    if (jn316 < 1) errors.push('cross_references present but John 3:16 has none')
  } else {
    console.warn('  note: cross_references empty (TSK download skipped)')
  }

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
