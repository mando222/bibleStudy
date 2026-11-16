import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, gunzipSync } from 'node:zlib'
import literaryInputs from './assets/literary-source-hashes.json'
import alignmentInputs from './assets/word-source-hashes.json'
import { BOOKS } from '../src/shared/books'
import { splitVerseUnits } from '../src/shared/verseUnits'
import { countSourceSpans } from '../src/main/db/sourceWordCoverage'
import { applyEvidence, type ReviewRow } from './editionReviews'
import { buildDerivedTags } from './editionInference'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../data/editions')
const MIGRATION = '302bb5f92f1e05bf4b96c894f96da77a4cf10845'
const BEREAN = alignmentInputs['bsb_tables.tsv']
const ids = ['KJV', 'BSB', 'WEB', 'ASV', 'YLT', 'JuliaSmith', 'TNT', 'GNV', 'WYC']
const upstreamIds: Record<string, string> = {
  KJV: 'eng_kjv',
  BSB: 'BSB',
  WEB: 'ENGWEBP',
  ASV: 'eng_asv',
  YLT: 'eng_ylt',
  TNT: 'eng_tnt',
  GNV: 'eng_gnv',
  WYC: 'eng_w88'
}
const checksum = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
type Cell = string | number | null
type Row = Cell[]
type Edition = {
  id: string
  abbrev: string
  name: string
  license: string
  attribution: string
  sort_order: number
  language: string
  is_original: number
  has_strongs: number
  direction: string
}
type Manifest = {
  format: 1
  edition: Edition
  books: string[]
  migration: string
  inputs: Record<string, string>[]
  layers: Record<string, string[]>
  inference: string
  inferenceInputs?: Record<string, string>
  files: Record<string, string>
}
function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message)
}
function json(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}
function read<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}
function put(path: string, bytes: Buffer | string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}
function rows<T>(path: string): T[] {
  if (!existsSync(path)) return []
  const data = readFileSync(path, 'utf8').trimEnd()
  return data
    ? data.split('\n').map((line, i) => {
        try {
          return JSON.parse(line) as T
        } catch {
          throw Error(`${path}:${i + 1}: invalid JSON`)
        }
      })
    : []
}
function hashes(dir: string, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const item of readdirSync(join(dir, prefix), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en')
  )) {
    if (item.name.startsWith('.git') || (['manifest.json', 'README.md'].includes(item.name) && !prefix))
      continue
    const path = prefix ? prefix + '/' + item.name : item.name
    if (item.isDirectory()) Object.assign(files, hashes(dir, path))
    else {
      ensure(item.isFile() && !item.isSymbolicLink(), path + ' must be a regular file')
      files[path] = checksum(readFileSync(join(dir, path)))
    }
  }
  return files
}
const columns = {
  text: ['chapter', 'verse', 'text'],
  layout: ['chapter', 'verse', 'marks'],
  tokens: [
    'chapter',
    'verse',
    'position',
    'surface',
    'trailer',
    'strongs',
    'lemma',
    'translit',
    'morph',
    'gloss'
  ],
  inferred: ['chapter', 'verse', 'strongs'],
  alignments: [
    'chapter',
    'verse',
    'start_position',
    'end_position',
    'bsb_position',
    'source_row',
    'language',
    'english',
    'form',
    'translit',
    'strongs',
    'morph',
    'standalone',
    'unique_form'
  ]
}
type Layer = keyof typeof columns
const table: Record<Exclude<Layer, 'alignments'>, string> = {
  text: 'verses',
  layout: 'verse_layout',
  tokens: 'verse_tokens',
  inferred: 'derived_tags'
}
const alignedSql = `SELECT s.chapter,s.verse,s.start_position,s.end_position,s.bsb_position,s.source_row,s.language,
 (SELECT group_concat(piece,'') FROM (SELECT CASE WHEN t.position=s.end_position THEN t.surface ELSE t.surface||t.trailer END piece
  FROM verse_tokens t WHERE t.translation_id=s.translation_id AND t.book_id=s.book_id AND t.chapter=s.chapter AND t.verse=s.verse
  AND t.position BETWEEN s.start_position AND s.end_position ORDER BY position)) english,
 b.lemma form,b.translit,b.strongs,b.morph, (k.position IS NOT NULL) standalone,(u.source_row IS NOT NULL) unique_form
 FROM source_word_spans s JOIN verse_tokens b ON b.translation_id='BSB' AND b.book_id=s.book_id AND b.chapter=s.chapter AND b.verse=s.verse AND b.position=s.bsb_position
 LEFT JOIN source_word_singletons k ON k.translation_id=s.translation_id AND k.book_id=s.book_id AND k.chapter=s.chapter AND k.verse=s.verse AND k.position=s.end_position
 LEFT JOIN interlinear_source_rows u ON u.book_id=s.book_id AND u.chapter=s.chapter AND u.verse=s.verse AND u.source_row=s.source_row
 WHERE s.translation_id=? AND s.book_id=? ORDER BY s.chapter,s.verse,s.end_position`
const empty = () => ({
  verses: 0,
  layoutVerses: 0,
  taggedTokens: 0,
  inferredLinks: 0,
  alignmentLinks: 0,
  standaloneLinks: 0,
  publishedTags: 0,
  corroboratedLinks: 0,
  rejected: 0,
  explicitlyUnresolved: 0,
  distributorAwaitingReviewTags: 0,
  distributorUnmatchedVerseTags: 0,
  distributorUnmappedVerseTags: 0,
  unresolvedDistributorTags: 0,
  unresolvedCrossWireGroups: 0,
  filledMissingPublisherTags: 0,
  versesWithoutRestoration: 0
})
function coverage(dir: string, m: Manifest) {
  const books: Record<string, ReturnType<typeof empty>> = {}
  const totals = empty()
  const inventoryPath = join(dir, 'inventory.json')
  const inventory = existsSync(inventoryPath)
    ? read<{ books?: Record<string, Record<string, number>> }>(inventoryPath)
    : {}
  for (const book of m.books) {
    const c = empty()
    const load = (layer: string) => rows<Row>(join(dir, layer, book + '.jsonl'))
    const restored = new Set<string>()
    c.verses = load('text').length
    c.layoutVerses = load('layout').length
    c.taggedTokens = load('tokens').filter((t) => t[5]).length
    for (const [, , tags] of load('inferred'))
      c.inferredLinks += (String(tags).match(/[HG]\d+/g) ?? []).length
    for (const a of load('alignments')) {
      c.alignmentLinks++
      c.standaloneLinks += Number(a[12])
      restored.add(a[0] + '.' + a[1])
      if (m.edition.id === 'KJV') c.corroboratedLinks++
    }
    for (const e of rows<ReviewRow>(join(dir, 'evidence', book + '.jsonl'))) {
      if (e.status === 'corroborated') {
        c.corroboratedLinks++
        c.alignmentLinks++
        c.standaloneLinks += Number(!!e.source?.standalone)
        restored.add(e.chapter + '.' + e.verse)
      }
      if (e.status === 'published' || e.status === 'corroborated') c.publishedTags++
      if (e.status === 'rejected') c.rejected++
      if (e.status === 'unresolved') c.explicitlyUnresolved++
    }
    const audit = inventory.books?.[book] ?? {}
    c.distributorAwaitingReviewTags = audit.awaitingReview ?? 0
    c.distributorUnmatchedVerseTags = audit.unmatchedVerseTags ?? 0
    c.distributorUnmappedVerseTags = audit.unmappedVerseTags ?? 0
    c.unresolvedDistributorTags =
      c.distributorAwaitingReviewTags + c.distributorUnmatchedVerseTags + c.distributorUnmappedVerseTags
    c.filledMissingPublisherTags = audit.crosswireFilledMissingTags ?? 0
    c.unresolvedCrossWireGroups = (audit.crosswireWordGroups ?? 0) - (audit.crosswireCorroborated ?? 0)
    c.versesWithoutRestoration = c.verses - restored.size
    books[book] = c
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += c[key]
  }
  return {
    edition: m.edition.id,
    books,
    totals,
    units: {
      unresolvedDistributorTags:
        'Upstream distributor word tags withheld for missing, unmatched or insufficient evidence.',
      unresolvedCrossWireGroups:
        'CrossWire OSIS word groups without a new verified link, including conflicts and overlap with existing migrated links.',
      explicitlyUnresolved:
        'Individually recorded unresolved evidence rows. Do not sum across source inventories.',
      alignmentLinks:
        'Verified English spans. Original form can appear beside a span that cannot stand alone.',
      inferredLinks:
        'Stored inference candidates before per-occurrence publisher evidence takes precedence.'
    }
  }
}
function seal(dir: string, m: Manifest) {
  json(join(dir, 'coverage.json'), coverage(dir, m))
  m.files = hashes(dir)
  json(join(dir, 'manifest.json'), m)
}
function writeReadme(dir: string, edition: Edition) {
  const id = edition.id,
    slug = id.toLowerCase()
  put(
    join(dir, 'README.md'),
    `# ${edition.name}

${edition.attribution}

This data uses the native addresses of ${id}. The exact bundled books are listed in manifest.json. Text, layout, word tokens, inferred lookup, verified alignments and reviewed evidence use separate book files. Each JSON Lines array uses the column order in manifest.layers. Layout marks retain the edition’s UTF-16 offsets. The text is authoritative for punctuation, spacing and copying.

The initial migration uses the Open Bible Study v0.5.0 corpus (commit ${MIGRATION}). The input snapshots and manifest checksums identify the available upstream revisions. Export can read the stored source archives directly from the edition checkout. The inventory lists additional source investigations. Coverage counts verified spans separately from inferred lookup and records verses without restoration data. The inference inputs are the KJV and BSB token layers and openscriptures/strongs lexicon at the migration revision. Editions with inferred tags record the input row and method digests in manifest.inferenceInputs. Verify new occurrence links against the named source row. Keep unconfirmed English matches out of restoration.

## Regeneration and review

Clone [Open Bible Study](https://github.com/mando222/bibleStudy) recursively, install its npm dependencies and run the following from the app checkout. The [v0.5.0 Android release](https://github.com/mando222/bibleStudy/releases/download/v0.5.0/Open-Bible-Study-Android-0.5.0.apk) contains the migration database. The APK SHA-256 is 0bbdcc8288040a37b9573f55cdb9c86d6376a90bc94c585b4e231f4c43e748a9. Extract its assets/library/bible.pack member and decompress it with gzip to obtain the SQLite file used by the commands below.

\`\`\`sh
node --experimental-sqlite --import tsx data-pipeline/editionPacks.ts export /path/to/v0.5.0/bible.sqlite ${slug}
python3 data-pipeline/edition-evidence/build.py /path/to/v0.5.0/bible.sqlite ${id}
node --experimental-sqlite --import tsx data-pipeline/editionPacks.ts integrate ${slug}
node --experimental-sqlite --import tsx data-pipeline/editionPacks.ts validate ${slug}
npm run db:build
\`\`\`

After manual corrections, run seal and validate, inspect the coverage and book-level diff, and propose a pinned submodule update in the app. Reviewed evidence uses UTF-16 offsets into the exact published verse. Published tags support dictionary lookup. Only corroborated evidence with a checked original token can add a restoration link.
`
  )
}
function registerReviews(dir: string, id: string) {
  const staged = join(HERE, 'sources/edition-evidence', id.toLowerCase())
  for (const item of ['inventory.json', 'upstream', 'evidence']) {
    if (existsSync(join(staged, item))) {
      if (item === 'evidence' || item === 'upstream')
        rmSync(join(dir, item), { recursive: true, force: true })
      cpSync(join(staged, item), join(dir, item), { recursive: true })
    }
  }
}
function inferenceInputs(db: DatabaseSync) {
  function digest(sql: string) {
    const hash = createHash('sha256')
    for (const row of db.prepare(sql).iterate()) hash.update(JSON.stringify(Object.values(row)) + '\n')
    return hash.digest('hex')
  }
  const result: Record<string, string> = {}
  for (const id of ['KJV', 'BSB'])
    result[id + 'Tokens'] = digest(
      `SELECT book_id,chapter,verse,position,surface,strongs FROM verse_tokens WHERE translation_id='${id}' ORDER BY book_id,chapter,verse,position`
    )
  result.strongsUsage = digest('SELECT id,kjv_def FROM strongs_lexicon ORDER BY id')
  result.algorithm = checksum(readFileSync(join(HERE, 'editionInference.ts')))
  result.referenceMapping = checksum(readFileSync(join(HERE, '../src/shared/passageMapping.ts')))
  result.derivation = checksum(readFileSync(join(HERE, 'lib.ts')))
  return result
}
function snapshot(cache: string, packed: string, compressed: boolean) {
  if (existsSync(cache)) return readFileSync(cache)
  const bytes = readFileSync(packed)
  return compressed ? gunzipSync(bytes) : bytes
}
function exportPacks(db: DatabaseSync, only?: string) {
  const inputs = inferenceInputs(db)
  for (const id of selected(only)) {
    console.log('Exporting ' + id)
    const slug = id.toLowerCase(),
      dir = join(ROOT, slug)
    const edition = db.prepare('SELECT * FROM translations WHERE id=?').get(id) as unknown as Edition
    ensure(edition, id + ' missing from migration database')
    const books = BOOKS.filter((b) =>
      db.prepare('SELECT 1 FROM verses WHERE translation_id=? AND book_id=? LIMIT 1').get(id, b.id)
    ).map((b) => b.id)
    const m: Manifest = {
      format: 1,
      edition,
      books,
      migration: MIGRATION,
      inputs: [],
      layers: columns,
      inference:
        'BSB phrase alignment with KJV and BSB verse candidates, Strong’s KJV usage and English stems. Passage addresses mapped to KJV coordinates before lookup. Inferred links support dictionary lookup only. Regenerator: data-pipeline/editionInference.ts.',
      files: {}
    }
    if (!['BSB', 'KJV'].includes(id)) m.inferenceInputs = inputs
    const name = upstreamIds[id]
    const file = name ? 'helloao_' + name + '.json' : 'julia-smith-1876.json.gz'
    const bytes = snapshot(
      join(HERE, name ? 'sources' : 'assets', file),
      join(dir, 'sources', name ? file + '.gz' : file),
      !!name
    )
    const hash = checksum(bytes)
    if (name)
      ensure(
        hash === literaryInputs[file as keyof typeof literaryInputs],
        id + ' text upstream checksum failed'
      )
    put(join(dir, 'sources', name ? file + '.gz' : file), name ? gzipSync(bytes) : bytes)
    m.inputs.push({
      asset: file,
      sha256: hash,
      url: name
        ? 'https://bible.helloao.org/api/' + name + '/complete.json'
        : 'https://studybible.info/JuliaSmith/',
      license: edition.license,
      credit: edition.attribution
    })
    if (id === 'BSB') {
      const tsv = snapshot(
        join(HERE, 'sources/bsb_tables.tsv'),
        join(dir, 'sources/bsb_tables.tsv.gz'),
        true
      )
      ensure(checksum(tsv) === BEREAN, 'BSB table checksum failed')
      put(join(dir, 'sources/bsb_tables.tsv.gz'), gzipSync(tsv))
    }
    if (id === 'BSB' || id === 'KJV')
      m.inputs.push({
        asset: 'bsb_tables.tsv',
        url: 'https://bereanbible.com/bsb_tables.tsv',
        sha256: BEREAN,
        license: 'Public domain',
        credit: 'Berean Bible, Berean Translation Table'
      })
    for (const book of books) {
      for (const layer of Object.keys(columns) as Layer[]) {
        const sql =
          layer === 'alignments'
            ? alignedSql
            : `SELECT ${columns[layer].join(',')} FROM ${table[layer]} WHERE translation_id=? AND book_id=? ORDER BY chapter,verse${layer === 'tokens' ? ',position' : ''}`
        const lines = []
        for (const record of db.prepare(sql).iterate(id, book)) {
          const data = columns[layer].map((k) =>
            layer === 'layout' && k === 'marks' ? JSON.parse(String(record[k])) : record[k]
          )
          lines.push(JSON.stringify(data))
        }
        if (lines.length) put(join(dir, layer, book + '.jsonl'), lines.join('\n') + '\n')
      }
    }
    if (!existsSync(join(dir, 'inventory.json')))
      json(join(dir, 'inventory.json'), { edition: id, migration: MIGRATION, sources: m.inputs })
    put(join(dir, '.gitattributes'), '* text=auto eol=lf\n*.gz binary\n*.zip binary\n')
    writeReadme(dir, edition)
    seal(dir, m)
  }
}
function selected(only?: string) {
  const result = ids.filter((id) => !only || id.toLowerCase() === only.toLowerCase())
  ensure(result.length, 'Unknown edition ' + only)
  return result
}
function validate(id: string) {
  const dir = join(ROOT, id.toLowerCase())
  ensure(
    existsSync(join(dir, 'manifest.json')),
    id + ' submodule missing. Run git submodule update --init --recursive.'
  )
  const m = read<Manifest>(join(dir, 'manifest.json'))
  ensure(m.format === 1 && m.edition.id === id, id + ' incompatible manifest or edition ID')
  ensure(JSON.stringify(m.layers) === JSON.stringify(columns), id + ' unsupported layer schema')
  ensure(
    m.books.length &&
      new Set(m.books).size === m.books.length &&
      m.books.every((book) => BOOKS.some((b) => b.id === book)),
    id + ' invalid book list'
  )
  const actual = hashes(dir)
  for (const path of new Set([...Object.keys(m.files), ...Object.keys(actual)]))
    ensure(
      actual[path] && actual[path] === m.files[path],
      id + ' missing, unlisted or checksum mismatch: ' + path
    )
  for (const book of m.books) ensure(actual['text/' + book + '.jsonl'], id + ' lacks text for ' + book)
  ensure(actual['coverage.json'] && actual['inventory.json'], id + ' missing coverage or source inventory')
  ensure(
    JSON.stringify(read(join(dir, 'coverage.json'))) === JSON.stringify(coverage(dir, m)),
    id + ' coverage does not match its book files'
  )
  for (const layer of [...Object.keys(columns), 'evidence']) {
    for (const path of Object.keys(actual).filter((p) => p.startsWith(layer + '/')))
      ensure(
        m.books.some((b) => path === layer + '/' + b + '.jsonl'),
        id + ' unrecognized book file ' + path
      )
  }
  return m
}
const insertRow = (db: DatabaseSync, name: string, fields: string[]) =>
  db.prepare(`INSERT INTO ${name} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`)
function importEdition(db: DatabaseSync, m: Manifest) {
  const id = m.edition.id,
    dir = join(ROOT, id.toLowerCase())
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(
    'edition_manifest_sha256.' + id,
    checksum(readFileSync(join(dir, 'manifest.json')))
  )
  const meta = m.edition
  const metadata: (keyof Edition)[] = [
    'id',
    'abbrev',
    'name',
    'language',
    'direction',
    'is_original',
    'has_strongs',
    'license',
    'attribution',
    'sort_order'
  ]
  insertRow(db, 'translations', metadata).run(...metadata.map((field) => meta[field]))
  const fields = ['translation_id', 'book_id']
  const insText = insertRow(db, 'verses', [...fields, ...columns.text])
  const insFts = insertRow(db, 'verses_fts', [...fields, ...columns.text])
  const insLayout = insertRow(db, 'verse_layout', [...fields, ...columns.layout])
  const insToken = insertRow(db, 'verse_tokens', [...fields, ...columns.tokens])
  const insInferred = insertRow(db, 'derived_tags', [...fields, ...columns.inferred])
  const insSpan = db.prepare('INSERT INTO source_word_spans VALUES(?,?,?,?,?,?,?,?,?)')
  const insStandalone = db.prepare('INSERT INTO source_word_singletons VALUES(?,?,?,?,?,?)')
  const insUnique = db.prepare('INSERT INTO interlinear_source_rows VALUES(?,?,?,?)')
  const insOccurrence = db.prepare(
    'INSERT INTO edition_occurrences VALUES(' + Array(24).fill('?').join(',') + ')'
  )
  const bereanRevision = m.inputs.find((input) => input.asset === 'bsb_tables.tsv')?.sha256 ?? ''
  if (id === 'BSB' || id === 'KJV')
    ensure(/^[a-f0-9]{64}$/.test(bereanRevision), id + ' lacks the Berean migration source revision')
  if (id === 'BSB') {
    const publisher = gunzipSync(readFileSync(join(dir, 'sources/bsb_tables.tsv.gz')))
    ensure(checksum(publisher) === bereanRevision, 'BSB publisher TSV digest mismatch')
  }
  const chapters = new Set<string>()
  let verses = 0
  for (const book of m.books) {
    const load = (layer: Layer) => rows<Row>(join(dir, layer, book + '.jsonl'))
    const published = new Map<string, string>()
    const key = (c: Cell, v: Cell) => c + '.' + v
    for (const row of load('text')) {
      const [c, v, text] = row
      ensure(
        typeof text === 'string' && text.length && Number.isInteger(c) && Number.isInteger(v),
        id + ' invalid verse in ' + book
      )
      published.set(key(c, v), text)
      chapters.add(book + '.' + c)
      insText.run(id, book, ...row)
      insFts.run(id, book, ...row)
      verses++
    }
    for (const [c, v, marks] of load('layout')) {
      ensure(published.has(key(c, v)) && Array.isArray(marks), id + ' orphan layout in ' + book)
      insLayout.run(id, book, c, v, JSON.stringify(marks))
    }
    const tokens = new Map<string, Row[]>()
    for (const row of load('tokens')) {
      const [c, v, p] = row,
        k = key(c, v),
        group = tokens.get(k) ?? []
      ensure(p === group.length, id + ' token sequence gap in ' + book + ' ' + k)
      group.push(row)
      tokens.set(k, group)
      insToken.run(id, book, ...row)
    }
    for (const [k, group] of tokens)
      ensure(
        group.map((t) => String(t[3]) + String(t[4])).join('') === published.get(k),
        id + ' tokens differ from ' + book + ' ' + k
      )
    for (const [c, v, tags] of load('inferred')) {
      const text = published.get(key(c, v))
      ensure(
        typeof tags === 'string' &&
          text &&
          /^(?:-|[HG][0-9]+)(?: (?:-|\+|[HG][0-9]+))*$/.test(tags) &&
          tags.split(' ').length === splitVerseUnits(text).length,
        id + ' invalid inferred mapping at ' + book + ' ' + key(c, v)
      )
      insInferred.run(id, book, c, v, tags)
    }
    for (const [
      c,
      v,
      first,
      last,
      pos,
      row,
      lang,
      english,
      form,
      translit,
      strongs,
      morph,
      standalone,
      unique
    ] of load('alignments')) {
      const group = tokens.get(key(c, v))
      ensure(
        group &&
          Number.isInteger(first) &&
          Number.isInteger(last) &&
          Number(first) <= Number(last) &&
          group
            .slice(Number(first), Number(last) + 1)
            .map((t, i) => String(t[3]) + (i + Number(first) === last ? '' : String(t[4])))
            .join('') === english &&
          group[Number(last)]?.[5] === strongs &&
          form &&
          translit &&
          /^[1-9]\d*(\.\d+)?$/.test(String(row)),
        id + ' invalid verified span at ' + book + ' ' + key(c, v)
      )
      if (id === 'BSB')
        ensure(
          group[Number(pos)][6] === form && group[Number(pos)][7] === translit,
          id + ' mismatched publisher token ' + row
        )
      insSpan.run(id, book, c, v, first, last, pos, row, lang)
      if (standalone) insStandalone.run(id, book, c, v, last, row)
      if (id === 'BSB' && unique) insUnique.run(book, c, v, row)
      const cite =
        id === 'BSB'
          ? 'Berean Translation Table'
          : 'KJV Strong’s tagging; Berean Translation Table; ' +
            (lang === 'Greek' ? 'Textus Receptus' : 'Masoretic Text')
      insOccurrence.run(
        id,
        book,
        c,
        v,
        first,
        last,
        english,
        'BSB',
        bereanRevision,
        book,
        c,
        v,
        row,
        null,
        lang,
        form,
        translit,
        strongs,
        morph,
        id === 'BSB' ? 'aligned' : 'corroborated',
        cite + ' · ' + book + ' ' + c + ':' + v + ' · row ' + row,
        standalone,
        unique,
        1
      )
    }
  }
  return { id, verses, chapters: chapters.size, books: m.books.length }
}
export function importEditionPacks(db: DatabaseSync) {
  return ids.map((id) => {
    try {
      console.log('• Importing ' + id + ' edition pack')
      const m = validate(id)
      db.exec('BEGIN')
      const result = importEdition(db, m)
      db.exec('COMMIT')
      return result
    } catch (error) {
      throw Error(id + ' edition import: ' + error)
    }
  })
}
export function finishEditionPacks(db: DatabaseSync) {
  db.exec('BEGIN')
  try {
    for (const id of ids) {
      const dir = join(ROOT, id.toLowerCase())
      const m = read<Manifest>(join(dir, 'manifest.json'))
      for (const book of m.books) {
        const review = rows<ReviewRow>(join(dir, 'evidence', book + '.jsonl'))
        if (review.length) applyEvidence(db, id, book, review)
      }
    }
    db.exec(
      "INSERT INTO meta(key,value) VALUES('source_word_alignment_version','1'),('edition_pack_version','1')"
    )
    const add = db.prepare('INSERT INTO source_word_coverage VALUES(?,?,?)')
    for (const [lemma, editions] of countSourceSpans(db))
      for (const [edition, n] of editions) add.run(lemma, edition, n)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
function parity(base: string, path: string) {
  const db = new DatabaseSync(path, { readOnly: true })
  db.prepare('ATTACH DATABASE ? AS previous').run(resolve(base))
  const english = ids.map((id) => "'" + id + "'").join(',')
  for (const name of [
    'translations',
    'verses',
    'verse_layout',
    'verse_tokens',
    'source_word_spans',
    'source_word_singletons',
    'interlinear_source_rows'
  ]) {
    const condition =
      name === 'interlinear_source_rows'
        ? ''
        : name === 'translations'
          ? ' WHERE id IN (' + english + ')'
          : ['verse_tokens', 'source_word_spans', 'source_word_singletons'].includes(name)
            ? " WHERE translation_id IN ('KJV','BSB')"
            : ' WHERE translation_id IN (' + english + ')'
    // Existing non-null tags must also agree. Check that separately to allow independently
    // verified lexical tags to fill formerly empty KJV tokens without changing their text.
    const fields =
      name === 'verse_tokens'
        ? 'translation_id,book_id,chapter,verse,position,surface,trailer,lemma,translit,morph,gloss'
        : '*'
    for (const [a, b] of [
      ['main', 'previous'],
      ['previous', 'main']
    ]) {
      const different = db
        .prepare(
          `SELECT ${fields} FROM ${a}.${name}${condition} EXCEPT SELECT ${fields} FROM ${b}.${name}${condition} LIMIT 1`
        )
        .get()
      ensure(!different, name + ' differs from v0.5.0: ' + JSON.stringify(different))
    }
    if (name === 'verse_tokens') {
      const delta = `FROM main.verse_tokens t JOIN previous.verse_tokens p USING(translation_id,book_id,chapter,verse,position)
        LEFT JOIN edition_token_evidence e USING(translation_id,book_id,chapter,verse,position)
        LEFT JOIN edition_occurrences o ON o.translation_id=t.translation_id AND o.book_id=t.book_id AND o.chapter=t.chapter
        AND o.verse=t.verse AND o.end_position=t.position
        WHERE t.translation_id IN ('KJV','BSB') AND t.strongs IS NOT p.strongs`
      const unexpected = db
        .prepare(
          `SELECT t.*,p.strongs previous_tag ${delta}
        AND (t.translation_id!='KJV' OR p.strongs IS NOT NULL OR t.strongs IS NULL OR e.kind IS NOT 'corroborated'
          OR o.strongs IS NOT t.strongs OR o.evidence IS NOT 'corroborated' OR o.preserve_preset IS NOT 0) LIMIT 1`
        )
        .get()
      ensure(
        !unexpected,
        'Changed historical publisher tag without an independent verification: ' +
          JSON.stringify(unexpected)
      )
      console.log(
        'New verified lexical tags in previously empty KJV tokens:',
        db.prepare('SELECT count(*) n ' + delta).get()?.n
      )
    }
    console.log(name + ' passed v0.5.0 parity')
  }
  for (const [id, n] of [
    ['BSB', 348742],
    ['KJV', 2051]
  ] as const) {
    const count = db
      .prepare("SELECT count(*) n FROM edition_occurrences WHERE translation_id=? AND source_edition='BSB'")
      .get(id)
    ensure(count?.n === n, id + ' failed occurrence migration: ' + count?.n)
    console.log(id + ': ' + n + ' verified spans')
  }
  console.log(
    'Inferred verse records updated after native reference mapping:',
    db
      .prepare(
        'SELECT count(*) n FROM derived_tags d JOIN previous.derived_tags p USING(translation_id,book_id,chapter,verse) WHERE d.strongs!=p.strongs'
      )
      .get()?.n
  )
  console.table(
    db
      .prepare(
        "SELECT translation_id,count(*) AS additions FROM edition_occurrences WHERE source_edition!='BSB' GROUP BY translation_id"
      )
      .all()
  )
  db.close()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg, extra] = process.argv.slice(2)
  if (command === 'validate')
    for (const id of selected(arg)) {
      validate(id)
      console.log(id + ' validated')
    }
  else if (command === 'seal' || command === 'integrate')
    for (const id of selected(arg)) {
      const dir = join(ROOT, id.toLowerCase())
      const m = read<Manifest>(join(dir, 'manifest.json'))
      if (command === 'integrate') {
        ensure(
          existsSync(join(HERE, 'sources/edition-evidence', id.toLowerCase(), 'inventory.json')),
          id + ' evidence generation incomplete'
        )
        registerReviews(dir, id)
        writeReadme(dir, m.edition)
      }
      seal(dir, m)
    }
  else if (command === 'export') {
    ensure(arg && existsSync(arg), 'export requires v0.5.0 database path')
    const db = new DatabaseSync(arg, { readOnly: true })
    db.exec('CREATE TEMP TABLE derived_tags AS SELECT * FROM main.derived_tags WHERE 0')
    db.exec(
      'CREATE UNIQUE INDEX temp.inferred_location ON derived_tags(translation_id,book_id,chapter,verse)'
    )
    const scores = buildDerivedTags(db)
    ensure(
      scores.agreement >= 90 && scores.coverage.every((c) => c.pct >= 20),
      'inference calibration failed'
    )
    exportPacks(db, extra)
    db.close()
  } else if (command === 'parity' && arg && extra) parity(arg, extra)
  else
    throw Error(
      'Usage: editionPacks.ts validate|seal|integrate [slug], export BASELINE [slug], or parity BASELINE NEWDB'
    )
}
