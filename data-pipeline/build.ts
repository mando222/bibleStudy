/**
 * Builds the bundled read-only `resources/bible.sqlite` from public-domain /
 * openly-licensed sources. Run with:  npm run db:build
 *
 * Uses Node's built-in `node:sqlite` (no native module). See
 * data-pipeline/schema.sql for the shape it produces.
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import wordSourceHashes from './assets/word-source-hashes.json'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BOOKS, BOOK_BY_USFM } from '../src/shared/books'
import { greekReadings, parseStepReference } from './step'
import { readPrintedOrder, checkPrintedOrder } from './greekOrder'
import { WordFrequencyIndex, parseHebrewFrequency, type HebrewWord } from './wordFrequency'
import { importEditionPacks, finishEditionPacks } from './editionPacks'
import { buildWordDirectory } from './wordDirectory'
import { buildStudyIndex } from './studyIndex'
import { foldLatinHomoglyphs } from '../src/shared/originalText'
import {
  cleanLexBody,
  normGreek,
  normHebrew,
  normStrongs,
  translitGreek,
} from './lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(ROOT, 'resources', 'bible.sqlite')
const STAGED = `${OUT}.${process.pid}.tmp`
const SCHEMA = join(HERE, 'schema.sql')

// STEPBible Translators Amalgamated OT+NT (CC BY 4.0) — tagged original-language editions.
const STEP_REPO = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/f71b5e51f2d768ae72e3ed69743a7a9df25ef8b5'
const STEP_BASE = STEP_REPO + '/Translators%20Amalgamated%20OT%2BNT'
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
  { id: 'NA', name: 'Critical (NA28, STEPBible)', language: 'grc', testament: 'NT', sort: 3 },
  { id: 'TR', name: 'Textus Receptus (Scrivener 1894)', language: 'grc', testament: 'NT', sort: 4 },
  { id: 'BYZ', name: 'Byzantine (Robinson–Pierpont 2005)', language: 'grc', testament: 'NT', sort: 5 }
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

/** Extract the JSON object literal out of an openscriptures `var X = {...};` file. */
function parseDictJs(src: string): Record<string, Record<string, string>> {
  const eq = src.search(/var\s+strongs\w+Dictionary\s*=/)
  const start = src.indexOf('{', eq === -1 ? 0 : eq)
  const end = src.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('could not locate dictionary object')
  return JSON.parse(src.slice(start, end + 1))
}

async function downloadCached(name: string, url: string): Promise<string> {
  const p = join(HERE, 'sources', name)
  const expected = (wordSourceHashes as Record<string,string>)[name]
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  if (!existsSync(p) || (expected && digest(readFileSync(p)) !== expected)) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`GET ${name} → ${r.status}`)
    mkdirSync(dirname(p), { recursive: true })
    const bytes = Buffer.from(await r.arrayBuffer())
    if (expected && digest(bytes) !== expected)
      throw new Error(`Publisher data changed for ${name}. Review the new source before updating its recorded checksum.`)
    writeFileSync(p, bytes)
  }
  return p
}

/** Reconstruct each named edition from TAGNT's readings, spellings and order markers.
 * Reader addresses follow KJV versification so parallel editions and links agree. Preserve
 * native chapter and verse on every token (e.g. the Byzantine placement of Rom 16:25). */
async function buildGreekEditions(db: DatabaseSync, frequencies: WordFrequencyIndex): Promise<number> {
  const printed: Record<string, Map<string, string[]>> = {}
  for (const [edition, archive] of [['TR', 'SCR-ASCII.ZIP'], ['BYZ', 'BYZ-ASCII.ZIP']] as const) {
    const path = await downloadCached(archive, 'https://www.byztxt.com/download/' + archive)
    printed[edition] = readPrintedOrder(readFileSync(path), edition)
  }
  const uncertainOrder = db.prepare('INSERT INTO greek_order_uncertainties VALUES (?,?,?,?)')
  const ins = db.prepare(
    `INSERT INTO original_tokens
       (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss, native_chapter, native_verse)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  let count = 0
  for (const [name, url] of TAGNT_FILES) {
    const path = await downloadCached(name, url)
    const verses = new Map<string, {book: string; chapter: number; verse: number; words: ReturnType<typeof greekReadings>}>()
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!/^[A-Za-z0-9]+\.\d/.test(line)) continue
      const c = line.split('\t')
      const ref = parseStepReference(c[0])
      if (!ref) throw new Error(`Unknown TAGNT reference: ${c[0]}`)
      const book = stepBookId(ref.book)
      if (!book) throw new Error(`Unknown TAGNT book: ${ref.book}`)
      const {chapter, verse} = ref.kjv ?? ref
      for (const word of greekReadings(c, ref)) {
        const key = `${word.edition}:${book}:${chapter}:${verse}`
        let group = verses.get(key)
        if (!group) verses.set(key, group = {book, chapter, verse, words: []})
        // When adjacent source verses contribute to one English verse, retain their sequence.
        word.order += (ref.chapter * 1000 + ref.verse) * 1000
        group.words.push(word)
      }
    }
    db.exec('BEGIN')
    for (const {book, chapter, verse, words} of verses.values()) {
      words.sort((a,b) => a.order - b.order)
      const edition = words[0].edition
      const nativeRefs = new Set(words.map(w => book + '.' + w.nativeChapter + '.' + w.nativeVerse))
      const order = edition === 'NA'
        ? { words, uncertain: words.some(w => w.displaced) }
        : checkPrintedOrder(words, nativeRefs.size === 1 ? printed[edition].get([...nativeRefs][0]) : undefined)
      if (order.uncertain) uncertainOrder.run(edition, book, chapter, verse)
      order.words.forEach((w, pos) => {
        ins.run(w.edition,book,chapter,verse,pos,w.original,w.translit,w.strongs,w.morph,w.gloss,w.nativeChapter,w.nativeVerse)
        frequencies.greek(book,chapter,verse,pos,w)
        count++
      })
    }
    db.exec('COMMIT')
  }
  return count
}

/** Build the Masoretic (MT) Hebrew edition from TAHOT, capturing Ketiv/Qere variants. */
async function buildHebrewEdition(db: DatabaseSync, frequencies: WordFrequencyIndex): Promise<{ count: number; kq: number }> {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO original_tokens (edition, book_id, chapter, verse, position, original, translit, strongs, morph, gloss, native_chapter, native_verse, source_type)
     VALUES ('MT',?,?,?,?,?,?,?,?,?,?,?,?)`
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
    let frequencyWords: HebrewWord[] = []
    let pos = 0
    db.exec('BEGIN')
    for (const line of lines) {
      if (!/^[A-Za-z0-9]+\.\d/.test(line)) continue
      const c = line.split('\t')
      const ref = parseStepReference(c[0])
      if (!ref) throw new Error(`Unknown TAHOT reference: ${c[0]}`)
      const book = stepBookId(ref.book)
      if (!book) throw new Error(`Unknown TAHOT book: ${ref.book}`)
      const {chapter, verse} = ref
      const vk = `${book}.${chapter}.${verse}`
      if (vk !== curVerse) {
        frequencies.hebrewVerse(frequencyWords)
        frequencyWords = []
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
      ins.run(book, chapter, verse, position, original, translit, strongs, morph, gloss, ref.native?.chapter ?? chapter, ref.native?.verse ?? verse, ref.type)
      const frequencyWord = parseHebrewFrequency(c, ref.type, { book,chapter,verse,position,
        nativeChapter:ref.native?.chapter ?? chapter, nativeVerse:ref.native?.verse ?? verse })
      if (frequencyWord) frequencyWords.push(frequencyWord)
      count++

      // Ketiv/Qere? The type looks like Q(K), Q(k), or Q(K+B) — the letter case marks significance.
      // The Ketiv Hebrew appears in one of two TAHOT forms: "K= translit (Hebrew) …" (parens), or
      // ";K= Hebrew" (direct). Prefer the parens form; fall back to the direct one.
      const kqType = /^Q\(([Kk])/.exec(ref.type)
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
    frequencies.hebrewVerse(frequencyWords)
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
    // First1KGreek's export sometimes gives the unnumbered title before a Psalm
    // the previous Psalm's last verse number. Keep such front matter at verse 0.
    const firstSlots = new Map<number, number[]>()
    if (book === 'Ps') {
      for (const line of lines) {
        const loc = /^\d+\.(\d+)\.(\d+) /.exec(line)
        if (!loc) continue
        const ch = Number(loc[1])
        const slots = firstSlots.get(ch) ?? []
        if (slots.length < 2 && slots.at(-1) !== Number(loc[2])) slots.push(Number(loc[2]))
        firstSlots.set(ch, slots)
      }
    }
    let lastChapter = -1
    let inTitle = false
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
      let verse = Number(m[2])
      if (chapter !== lastChapter) {
        const slots = firstSlots.get(chapter)
        inTitle = !!slots && slots[0] > 1 && slots[1] === 1
        lastChapter = chapter
      }
      if (verse === 1) inTitle = false
      if (inTitle) verse = 0
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
  // The Greek NT is searchable in every edition, even when the reader displays English.
  // Its native interlinear stays keyed to edition; only MT and LXX are standalone reading versions.
  for (const edition of ['NA', 'TR', 'BYZ']) {
    const text = db.prepare(`SELECT book_id, chapter, verse, group_concat(original, ' ' ORDER BY position) AS text
      FROM original_tokens WHERE edition=? GROUP BY book_id, chapter, verse`)
    db.exec('BEGIN')
    for (const row of text.iterate(edition)) {
      insFts.run(foldOriginal(String(row.text)), edition, row.book_id, row.chapter, row.verse)
    }
    db.exec('COMMIT')
  }
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
    'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc/json'
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
  // Mark 6:3 names Jesus' brothers but does not specify their parentage.
  const brothersOfJesus = new Set([719, 1721, 1756, 2747])
  // These entries infer a sibling from "cousin" (Col 4:10), an unnamed wife
  // (1 Chr 4:19), or an uncle of unspecified parentage (Jer 32:7).
  const unsupportedSiblingPairs = new Set(['1722/1941', '1544/2133', '1529/2525'])
  const siblingPairs = new Set<string>()
  db.exec('BEGIN')
  for (const p of people) {
    const f = p.fields
    const id = f.personID as number | undefined
    if (id == null) continue
    const sourceRefs = resolveVerses(f.verses)
    // Theographic groups the ancestor, nation and land under person 2103. Among
    // its 149 citations only Genesis 19:37 identifies Moab, the son of Lot.
    const vs = id === 2103 ? sourceRefs.filter(ref => ref === 'Gen.19.37') : sourceRefs
    const summary = ((f.dictionaryText as string) || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    insP.run(
      id,
      (f.name as string) || (f.displayTitle as string) || `Person ${id}`,
      (f.gender as string) || null,
      num(f.birthYear),
      num(f.deathYear),
      brothersOfJesus.has(id) ? null : personIdByRec.get(first(f.father) ?? '') ?? null,
      brothersOfJesus.has(id) ? null : personIdByRec.get(first(f.mother) ?? '') ?? null,
      (f.slug as string) || null,
      summary || null,
      vs.length,
      JSON.stringify(vs)
    )
    for (const c of (f.children as string[]) || []) {
      const rid = personIdByRec.get(c)
      if (rid != null && !((id === 1715 || id === 1938) && brothersOfJesus.has(rid))) insL.run(id, rid, 'child')
    }
    // Keep explicit siblings even where a parent has no catalog entry, as in
    // Mary, Martha and Lazarus. A single undirected edge supports both profiles.
    for (const field of ['siblings', 'halfSiblingsSameFather', 'halfSiblingsSameMother']) {
      for (const record of (f[field] as string[]) || []) {
        const other = personIdByRec.get(record)
        if (other == null || other === id) continue
        const [a, b] = id < other ? [id, other] : [other, id]
        const pair = a + '/' + b
        if (siblingPairs.has(pair) || unsupportedSiblingPairs.has(pair)) continue
        siblingPairs.add(pair)
        insL.run(a, b, 'sibling')
      }
    }
    for (const s of (f.partners as string[]) || []) {
      const rid = personIdByRec.get(s)
      if (rid != null) insL.run(id, rid, 'spouse')
    }
  }
  db.exec('COMMIT')

  // Places (with a derived active year-window)
  const insPl = db.prepare(
    `INSERT OR REPLACE INTO places (id,name,lat,lon,feature_type,aliases,precision,ambiguous,identification_note,comment,verse_count,verses,start_year,end_year)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  db.exec('BEGIN')
  for (const pl of places) {
    const f = pl.fields
    const id = f.placeID as number | undefined
    if (id == null) continue
    const vs = resolveVerses(f.verses)
    const win = placeWindow(f)
    const name = String(f.kjvName || f.esvName || f.placeLookup || `Place ${id}`).trim()
    // Some source alias fields contain a transcription note instead of a place name.
    const extraNames = typeof f.aliases === 'string' && !f.aliases.startsWith('4b is just') ? f.aliases.split(',') : []
    const aliases = [...new Set([f.esvName, f.displayTitle, ...extraNames]
      .filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(v => v && v !== name))]
    insPl.run(
      id,
      name,
      flt(f.openBibleLat ?? f.latitude),
      flt(f.openBibleLong ?? f.longitude),
      (f.featureType as string) || null,
      JSON.stringify(aliases),
      (f.precision as string) || null,
      f.ambiguous === true ? 1 : 0,
      (f.recogitoComments as string) || null,
      (f.comment as string) || null,
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
    ].filter(person => !(id === 137 && person === 2103)) // Judges 3:15–30 concerns Eglon's kingdom of Moab.
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
              sl.gloss AS kjv, sl.definition AS def
       FROM original_tokens ot LEFT JOIN lexicon_headwords sl ON sl.id = ot.strongs
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
  for (const f of [STAGED, `${STAGED}-journal`]) {
    if (existsSync(f)) rmSync(f)
  }

  const db = new DatabaseSync(STAGED)
  db.exec('PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF;')
  db.exec(readFileSync(SCHEMA, 'utf8'))

  // Books (canonical)
  const insBook = db.prepare(
    'INSERT INTO books (id, usfm, name, testament, sort_order, num_chapters) VALUES (?,?,?,?,?,?)'
  )
  db.exec('BEGIN')
  BOOKS.forEach((b, i) => insBook.run(b.id, b.usfm, b.name, b.testament, i + 1, b.chapters))
  db.exec('COMMIT')

  const summary = importEditionPacks(db)

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

  const insEdition = db.prepare(
    'INSERT OR REPLACE INTO editions (id, name, language, testament, sort_order) VALUES (?,?,?,?,?)'
  )
  for (const e of EDITIONS) insEdition.run(e.id, e.name, e.language, e.testament, e.sort)
  process.stdout.write('• Hebrew interlinear (Masoretic)…')
  const frequencies = new WordFrequencyIndex(db)
  const mt = await buildHebrewEdition(db, frequencies)
  process.stdout.write(` ${mt.count} (+${mt.kq} Ketiv/Qere)\n`)
  process.stdout.write('• Greek interlinear (TR/Byz/Critical)…')
  const grcCount = await buildGreekEditions(db, frequencies)
  frequencies.finish()
  process.stdout.write(` ${grcCount}\n`)
  finishEditionPacks(db)

  process.stdout.write('• Septuagint (Swete + Esdras B)…')
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
  buildWordDirectory(db)
  process.stdout.write(` ${lexEntries} entries\n`)

  process.stdout.write('• Scripture-attested parses (scholar-tagged)…')
  const parseCount = buildFormParses(db)
  process.stdout.write(` ${parseCount} form-analyses\n`)

  process.stdout.write('• Theographic (people / places / events → Genealogies, Maps, Timelines)…')
  const theo = await buildTheographic(db)
  buildStudyIndex(db)
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
    'Pinned English edition repositories: helloao Free Use Bible API; eBible.org USFM; CrossWire KJV2003 and Maurice Robinson (New Testament); Julia E. Smith via StudyBible.info; openscriptures/strongs (CC-BY-SA); kaiserlik/kjv (KJV+Strong’s); bereanbible.com bsb_tables (BSB interlinear, public domain); STEPBible TAHOT/TAGNT + lexicons TBESH/TBESG/TFLSJ (CC-BY); Septuagint: Swete via Open Greek and Latin / First1KGreek, nathans/lxx-swete (CC-BY-SA 4.0); Theographic Bible Metadata (people/places/events, CC-BY-SA 4.0); Natural Earth land (public domain); Treasury of Scripture Knowledge cross-references via OpenBible.info (CC-BY); hand-authored kingdoms overlay (this project, CC0); Greek grammar course authored for this project, readings rendered from the NA28 readings represented by STEPBible TAGNT (CC BY 4.0)'
  )

  // ---- assertions --------------------------------------------------------
  const errors: string[] = []
  const bookCount = (db.prepare('SELECT COUNT(*) n FROM books').get() as { n: number }).n
  if (bookCount !== 66) errors.push(`expected 66 books, got ${bookCount}`)

  // Ground the frequency totals in attested readings, including a row-level alternate ID,
  // an edition-specific absence, and an attached Hebrew preposition in Genesis 1:1.
  const freqCount = db.prepare('SELECT COUNT(*) n FROM word_frequency_occurrences WHERE edition=? AND strongs=?')
  for (const edition of ['NA', 'TR', 'BYZ']) {
    const n = Number(freqCount.get(edition,'G33')?.n)
    if (n !== 3) errors.push(`${edition}: expected 3 Greek G33 alternate-tagged uses, got ${n}`)
    const rare = Number(freqCount.get(edition,'G1207')?.n)
    if (rare !== (edition === 'NA' ? 0 : 1)) errors.push(`${edition}: unexpected G1207 count ${rare}`)
  }
  const love = db.prepare(`SELECT COUNT(*) AS uses, COUNT(DISTINCT form) AS forms
    FROM word_frequency_occurrences WHERE edition='NA' AND strongs='G26'`).get()
  if (love?.uses !== 116 || love.forms !== 5) errors.push('NA G26 frequency/forms disagree with tagged readings')
  const inBeginning = db.prepare(`SELECT form FROM word_frequency_occurrences WHERE edition='MT'
    AND strongs='H9003' AND book_id='Gen' AND chapter=1 AND verse=1 AND position=0`).get()
  if (inBeginning?.form !== 'בְּ'.normalize('NFC')) errors.push('Missing Hebrew prefix from Genesis 1:1')
  if (db.prepare("SELECT 1 FROM word_frequency_occurrences WHERE strongs BETWEEN 'H9014' AND 'H9019' LIMIT 1").get()) {
    errors.push('TAHOT punctuation markers must not be indexed as lexical words')
  }
  const name = db.prepare(`SELECT segments FROM word_frequency_occurrences WHERE edition='MT' AND
    strongs='H7163' AND book_id='Job' AND chapter=42 AND verse=14`).all()
  if (name.length !== 1 || JSON.parse(String(name[0]?.segments ?? '[]')).length !== 2) {
    errors.push('Keren-happuch in Job 42:14 must be one use spanning two tagged source words')
  }

  for (const s of summary) {
    if (s.id === 'JuliaSmith' && s.verses !== 31102) {
      errors.push(`Julia Smith: expected 31,102 verses, found ${s.verses}`)
    }
    const scope = s.id === 'WYC' ? { books: 9, minVerses: 9000 } : s.id === 'TNT' ? 'nt' : 'full'
    if (typeof scope === 'object') {
      if (s.books !== scope.books) errors.push(`${s.id}: ${s.books} books (expected ${scope.books})`)
      if (s.verses < scope.minVerses) {
        errors.push(`${s.id}: only ${s.verses} verses (expected >= ${scope.minVerses})`)
      }
    } else {
      const want = scope === 'nt' ? { lo: 255, hi: 265, verses: 7900 } : { lo: 1180, hi: 1200, verses: 30000 }
      if (s.chapters < want.lo || s.chapters > want.hi) {
        errors.push(`${s.id}: ${s.chapters} chapters (expected ${want.lo}-${want.hi} for a '${scope}' text)`)
      }
      if (s.verses < want.verses) {
        errors.push(`${s.id}: only ${s.verses} verses (expected >= ${want.verses} for a '${scope}' text)`)
      }
    }
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

  // ASV sanity: right text, right versification, and its two signature renderings — the divine
  // name as "Jehovah" and a transliterated "Sheol" — so a mis-mapped source id can't slip through.
  // 31,086 not 31,102: the ASV follows the critical text, so it omits the 16 verses whose
  // manuscript support is weak (Matt 17:21, Mark 9:44, Acts 8:37, …) that the KJV's Textus
  // Receptus carries. It shares that exact omission set with the BSB. Verse NUMBERING still
  // matches the KJV, so parallel columns stay aligned — the 16 simply show as gaps.
  const asvCount = (
    db.prepare("SELECT COUNT(*) n FROM verses WHERE translation_id='ASV'").get() as { n: number }
  ).n
  if (asvCount !== 31086) errors.push(`ASV has ${asvCount} verses (expected 31086)`)
  const asvOmits = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM verses k WHERE k.translation_id='KJV' AND NOT EXISTS (
           SELECT 1 FROM verses a WHERE a.translation_id='ASV'
            AND a.book_id=k.book_id AND a.chapter=k.chapter AND a.verse=k.verse)`
      )
      .get() as { n: number }
  ).n
  if (asvOmits !== 16) errors.push(`ASV omits ${asvOmits} KJV verses (expected exactly 16)`)
  const asvGen = db
    .prepare("SELECT text FROM verses WHERE translation_id='ASV' AND book_id='Gen' AND chapter=2 AND verse=4")
    .get() as { text: string } | undefined
  if (!/Jehovah/.test(asvGen?.text ?? '')) {
    errors.push(`ASV Gen 2:4 should render the divine name as "Jehovah": ${asvGen?.text ?? '(missing)'}`)
  }
  const asvPs = db
    .prepare("SELECT text FROM verses WHERE translation_id='ASV' AND book_id='Ps' AND chapter=16 AND verse=10")
    .get() as { text: string } | undefined
  if (!/Sheol/.test(asvPs?.text ?? '')) {
    errors.push(`ASV Ps 16:10 should transliterate "Sheol": ${asvPs?.text ?? '(missing)'}`)
  }

  // Tyndale sanity: the right text, NT-only, and its 1534 spelling intact. A modernised or
  // mis-mapped source would sail through a bare row count, so check a signature spelling.
  // 7,954 and not the KJV NT's 7,957: verse numbers were retrofitted onto Tyndale's 1534 text in
  // 1551, and three of them (Mark 11:26, Luke 17:36, Rev 21:26) have no corresponding text — the
  // source carries them as empty placeholders. Those show as gaps in a parallel column.
  const tntCount = (
    db.prepare("SELECT COUNT(*) n FROM verses WHERE translation_id='TNT'").get() as { n: number }
  ).n
  if (tntCount !== 7954) errors.push(`TNT has ${tntCount} verses (expected 7954)`)
  const tntOt = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM verses WHERE translation_id='TNT'
           AND book_id IN (SELECT id FROM books WHERE testament='OT')`
      )
      .get() as { n: number }
  ).n
  if (tntOt !== 0) errors.push(`TNT is New Testament only, but carries ${tntOt} OT verses`)
  const tntJohn = db
    .prepare("SELECT text FROM verses WHERE translation_id='TNT' AND book_id='John' AND chapter=3 AND verse=16")
    .get() as { text: string } | undefined
  if (!/everlastinge/i.test(tntJohn?.text ?? '')) {
    errors.push(`TNT John 3:16 should keep 1534 spelling: ${tntJohn?.text ?? '(missing)'}`)
  }

  const derivedRows = (
    db.prepare('SELECT COUNT(*) n FROM derived_tags').get() as { n: number }
  ).n
  if (derivedRows < 100000) errors.push(`derived_tags has only ${derivedRows} rows`)
  // Derived tags must never shadow real scholarship.
  const overlap = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM derived_tags d
          WHERE d.translation_id IN ('BSB','KJV')`
      )
      .get() as { n: number }
  ).n
  if (overlap > 0) errors.push(`${overlap} derived rows for translations that have real tagging`)

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

  const count = (sql: string): number => Number(db.prepare(sql).get()?.n)
  if (count("SELECT COUNT(*) n FROM verses WHERE translation_id='MT' AND book_id='Ps' AND chapter=51 AND verse>0") !== 19)
    errors.push('The Hebrew reader must contain all 19 numbered verses of Psalm 51')
  if (count("SELECT COUNT(*) n FROM verses WHERE translation_id='MT' AND verse>0") !== 23145)
    errors.push('The Hebrew reader must contain all 23,145 numbered OT verses')
  if (count("SELECT COUNT(DISTINCT verse) n FROM original_tokens WHERE edition='NA' AND book_id='Rom' AND chapter=16 AND verse BETWEEN 25 AND 27") !== 3)
    errors.push('Romans 16:25–27 missing from the Greek NT')
  if (count("SELECT COUNT(*) n FROM original_tokens WHERE edition='NA' AND book_id='Jude' AND verse=5 AND strongs='G2424'") !== 1 ||
      count("SELECT COUNT(*) n FROM original_tokens WHERE edition='TR' AND book_id='Jude' AND verse=5 AND strongs='G2962'") !== 1)
    errors.push('Jude 1:5 must follow the edition-specific reading')
  if (count("SELECT COUNT(*) n FROM verses_fts WHERE translation_id='NA' AND verses_fts MATCH 'αγαπη*' AND book_id='1Cor' AND chapter=13 AND verse=4") !== 1)
    errors.push('Folded Greek NT full-text index did not find 1 Corinthians 13:4')

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
    throw new Error('Database integrity checks failed')
  }
  renameSync(STAGED, OUT)
  console.log('✓ All assertions passed.')
}

main().catch((err) => {
  rmSync(STAGED, { force: true })
  console.error(err)
  process.exit(1)
})
