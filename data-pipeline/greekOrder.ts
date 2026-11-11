import { strFromU8, unzipSync } from 'fflate'
import type { EditionWord } from './step'

// Filenames in Robinson's one-verse-per-line Scrivener and Byzantine archives.
const books: Record<string, string> = {
  MT: 'Matt', MR: 'Mark', LU: 'Luke', JOH: 'John', AC: 'Acts', RO: 'Rom', '1CO': '1Cor', '2CO': '2Cor',
  GA: 'Gal', EPH: 'Eph', PHP: 'Phil', COL: 'Col', '1TH': '1Thess', '2TH': '2Thess', '1TI': '1Tim',
  '2TI': '2Tim', TIT: 'Titus', PHM: 'Phlm', HEB: 'Heb', JAS: 'Jas', '1PE': '1Pet', '2PE': '2Pet',
  '1JO': '1John', '2JO': '2John', '3JO': '3John', JUDE: 'Jude', RE: 'Rev'
}

export function readPrintedOrder(archive: Uint8Array, edition: 'TR' | 'BYZ'): Map<string, string[]> {
  const verses = new Map<string, string[]>()
  const files = unzipSync(archive)
  for (const [name, book] of Object.entries(books)) {
    const file = name + '_' + (edition === 'TR' ? 'SCR' : 'BYZ') + '.txt'
    if (!files[file]) throw new Error('Missing Greek edition book: ' + file)
    for (const line of strFromU8(files[file]).split(/\r?\n/)) {
      if (!line.trim()) continue
      const match = /^(\d+):(\d+)(?: ([a-z ]+))?$/.exec(line.trim())
      if (!match) throw new Error('Unexpected Greek edition line in ' + file + ': ' + line)
      const key = book + '.' + match[1] + '.' + match[2]
      if (verses.has(key)) throw new Error('Duplicate Greek edition line: ' + key)
      // v is final sigma in these unaccented publisher files.
      verses.set(key, match[3]?.trim().replace(/v/g, 's').split(/ +/) ?? [])
    }
  }
  return verses
}

const alphabet = 'αβγδεζηθικλμνξοπρστυφχψω'
const publisherAscii = 'abgdezhyiklmnxoprstufcqw'

/** Comparison key only. Displayed words, punctuation and lexical analyses stay on their TAGNT row. */
function formKeys(surface: string): string[] {
  return surface.trim().split(/\s+/).map(word => {
    const base = word.normalize('NFD').toLowerCase().replace(/\p{M}/gu, '').replace(/ς/g, 'σ')
    const letters = Array.from(base).filter(ch => /\p{L}/u.test(ch))
    if (letters.some(ch => !alphabet.includes(ch))) return ''
    return letters.map(ch => publisherAscii[alphabet.indexOf(ch)]).join('')
  })
}

type OrderWord = Pick<EditionWord, 'original' | 'displaced'>

/** Use only one edition at one native verse. Unmoved TAGNT rows are a second constraint on
 * homographs: anchor their relative order only where both earliest and latest solutions agree.
 * An ambiguous occurrence retains its input sequence and is flagged for readers. */
export function checkPrintedOrder<T extends OrderWord>(words: T[], printed: string[] | undefined): {
  words: T[]; uncertain: boolean
} {
  const unresolved = { words, uncertain: true }
  if (!printed) return unresolved
  const forms = words.map(word => formKeys(word.original))
  const sequence = forms.flat()
  if (sequence.some(key => !key)) return unresolved
  const sameSequence = sequence.join(' ') === printed.join(' ')
  // Even identical unaccented sequences may conceal a transposition of two
  // different inflected or accented forms. Check displaced occurrences individually.
  if (sameSequence && !words.some(word => word.displaced)) return { words, uncertain: false }
  if (forms.some(form => form.length !== 1 || !form[0]) || words.length !== printed.length) return unresolved
  const keys = forms.map(form => form[0])
  const positions = new Map<string, number[]>()
  for (let i = 0; i < printed.length; i++) {
    const group = positions.get(printed[i]) ?? []
    group.push(i)
    positions.set(printed[i], group)
  }
  const inputs = new Map<string, number[]>()
  keys.forEach((key, i) => {
    const group = inputs.get(key) ?? []
    group.push(i)
    inputs.set(key, group)
  })
  const anchors = words.map((word, i) => word.displaced ? -1 : i).filter(i => i >= 0)
  const earliest: number[] = []
  const latest: number[] = []
  let left = 0
  let right = printed.length - 1
  for (const i of anchors) {
    while (left < printed.length && printed[left] !== keys[i]) left++
    earliest[i] = left++
  }
  for (let a = anchors.length - 1; a >= 0; a--) {
    const i = anchors[a]
    while (right >= 0 && printed[right] !== keys[i]) right--
    latest[i] = right--
  }
  const anchorsFit = left <= printed.length
  const ordered: T[] = []
  for (const [key, indices] of inputs) {
    const places = positions.get(key)
    if (!places || places.length !== indices.length) return unresolved
    const remaining = new Set(places)
    const pending = []
    for (const i of indices) {
      if (anchorsFit && !words[i].displaced && earliest[i] === latest[i]) {
        ordered[earliest[i]] = words[i]
        remaining.delete(earliest[i])
      } else pending.push(i)
    }
    // A singleton is identified by its own surface. Several unresolved identical
    // surfaces could carry different accents, analyses, or occurrence IDs.
    if (pending.length > 1) return unresolved
    if (pending.length) ordered[[...remaining][0]] = words[pending[0]]
  }
  return { words: ordered.every((word, i) => word === words[i]) ? words : ordered, uncertain: false }
}
