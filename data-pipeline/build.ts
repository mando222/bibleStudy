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

  const insMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)')
  insMeta.run('schema_version', '1')
  insMeta.run(
    'sources',
    'helloao Free Use Bible API; openscriptures/strongs (CC-BY-SA); kaiserlik/kjv (KJV+Strong’s); bereanbible.com bsb_tables (BSB interlinear, public domain)'
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
