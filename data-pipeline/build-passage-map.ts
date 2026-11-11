/**
 * Reproduce src/shared/lxxPassages.json from the bundled Swete/KJV verse inventory and
 * the CC BY 4.0 STEPBible TVTMS release. Run after db:build with tsx:
 *   tsx data-pipeline/build-passage-map.ts resources/bible.sqlite /path/to/TVTMS.txt
 * Source commit 5de0a47f35f0fc13dfe1430d104e5db8a4285f9c, Versification/TVTMS.
 * A CSV-like range encodes native chapter, first verse, last verse, KJV chapter, first verse.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { BOOK_BY_USFM } from '../src/shared/books'

type Location = { key: string; book: string; chapter: number; verse: number; whole: boolean }

function parseLocation(value: string): Location | null {
  const m = /^([A-Za-z0-9]+)\.(\d+):(\d+)(.*)$/.exec(value.trim())
  if (!m) return null
  const usfm = m[1].toUpperCase()
  const book = BOOK_BY_USFM[usfm]?.id ?? ({ NAH: 'Nah' } as Record<string, string>)[usfm]
  if (!book) return null
  return { key: `${book}.${m[2]}.${m[3]}`, book, chapter: +m[2], verse: +m[3], whole: !m[4] }
}

const [database, tsv] = process.argv.slice(2)
if (!database || !tsv) throw new Error('Pass the built database and STEPBible TVTMS file')
const db = new DatabaseSync(database, { readOnly: true })
const inventory = (id: string) =>
  db
    .prepare(
      'SELECT book_id,chapter,verse,text FROM verses WHERE translation_id=? ORDER BY book_id,chapter,verse'
    )
    .all(id) as { book_id: string; chapter: number; verse: number; text: string }[]
const english = new Set(inventory('KJV').map((r) => `${r.book_id}.${r.chapter}.${r.verse}`))
const swete = inventory('LXX')
const greek = new Set(
  swete.filter((r) => /\p{Script=Greek}/u.test(r.text)).map((r) => `${r.book_id}.${r.chapter}.${r.verse}`)
)
const last = new Map<string, number>()
for (const r of swete) last.set(`${r.book_id}.${r.chapter}`, r.verse)

function conditionsPass(tests: string): boolean {
  for (const test of tests
    .split('&')
    .map((t) => t.trim())
    .filter(Boolean)) {
    const m = /^(.+?)=(Last|Exist|NotExist)$/.exec(test)
    if (!m) return false // relative text length / subdivisions cannot be verified in this source
    const before = m[1].replace(/TextBeforeV1$/, '0')
    const loc = parseLocation(before)
    if (!loc || !loc.whole) return false
    const present = greek.has(loc.key)
    if (m[2] === 'Last' && last.get(`${loc.book}.${loc.chapter}`) !== loc.verse) return false
    if ((m[2] === 'Exist' && !present) || (m[2] === 'NotExist' && present)) return false
  }
  return true
}

const rules = readFileSync(tsv, 'utf8').split('#DataStart(Expanded)')[1]?.split('#DataEnd(Expanded)')[0]
if (!rules) throw new Error('Expanded TVTMS table missing')
const exceptions = new Set<string>()
const candidates = new Map<string, Set<string>>()
for (const line of rules.split('\n')) {
  const [tradition, from, to, action, , , , , tests] = line.split('\t')
  if (!from || !to || !tests) continue
  const source = parseLocation(from)
  const dest = parseLocation(to)
  if (!source) continue
  // In a region with Greek-specific numbering we may only fall back to the ordinary
  // coordinate when the edition inventory supports an explicit concordance rule.
  if (/Greek|Grk|Brenton/.test(tradition)) {
    exceptions.add(source.key)
    if (dest) exceptions.add(dest.key)
  }
  if (!/Greek|Grk|Brenton|Eng-KJV/.test(tradition) || !source.whole || !conditionsPass(tests)) continue
  const exact =
    dest?.whole && /^(Keep verse|Renumber verse)\*?$/.test(action.trim()) && english.has(dest.key)
  // IfEmpty and missing-verse footnotes address placeholders in some editions, not
  // the identity of an extant Greek passage. Other whole-verse merge/split rules
  // mean no single English verse represents the supplied text.
  if (action.startsWith('IfEmpty')) continue
  const answer = exact ? dest!.key : ''
  const matches = candidates.get(source.key) ?? new Set<string>()
  matches.add(answer)
  candidates.set(source.key, matches)
}

const forward = new Map<string, string>()
const counts = new Map<string, number>()
for (const source of greek) {
  const matches = candidates.get(source)
  const dest = matches
    ? matches.size === 1
      ? [...matches][0]
      : null
    : exceptions.has(source)
      ? null
      : source
  if (!dest || !english.has(dest)) continue
  forward.set(source, dest)
  counts.set(dest, (counts.get(dest) ?? 0) + 1)
}
const ranges: Record<string, number[][]> = {}
for (const r of swete) {
  const dest = forward.get(`${r.book_id}.${r.chapter}.${r.verse}`)
  if (!dest || counts.get(dest) !== 1) continue
  const [book, ch, v] = dest.split('.')
  if (book !== r.book_id) continue
  const group = (ranges[book] ??= [])
  const prev = group.at(-1)
  if (
    prev &&
    prev[0] === r.chapter &&
    prev[2] + 1 === r.verse &&
    prev[3] === +ch &&
    prev[4] + r.verse - prev[1] === +v
  )
    prev[2] = r.verse
  else group.push([r.chapter, r.verse, r.verse, +ch, +v])
}
const json =
  '{\n' +
  Object.entries(ranges)
    .map(([book, rows]) => `  "${book}": ${JSON.stringify(rows)}`)
    .join(',\n') +
  '\n}\n'
writeFileSync(new URL('../src/shared/lxxPassages.json', import.meta.url), json)
db.close()
