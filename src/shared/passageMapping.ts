import lxxRanges from './lxxPassages.json'

type Chapter = { book: string; chapter: number }
type Passage = Chapter & { verse: number }

// Each range is [native chapter, first verse, last verse, KJV chapter, first verse].
type Ranges = Record<string, number[][]>
const swete: Ranges = lxxRanges
const philippians: Ranges = { Phil: [[1, 16, 16, 1, 17], [1, 17, 17, 1, 16]] }

// These coordinates belong to the bundled editions. TAGNT original-token keys already
// follow KJV coordinates, even where a Greek edition prints a different verse number.
const exceptions: Record<string, Ranges> = {
  ASV: philippians,
  BSB: philippians,
  WEB: { Rom: [[14, 24, 26, 16, 25]] },
  GNV: { Dan: [[3, 31, 33, 4, 1], [4, 1, 34, 4, 4]] }
}

function mappedRange(ref: Passage, edition: string, toKjv: boolean): Passage | null {
  const ranges = edition === 'LXX' ? swete : exceptions[edition]
  let otherSideOnly = false
  for (const [nativeChapter, first, last, kjvChapter, kjvFirst] of ranges?.[ref.book] ?? []) {
    const inNative = ref.chapter === nativeChapter && ref.verse >= first && ref.verse <= last
    const inKjv = ref.chapter === kjvChapter && ref.verse >= kjvFirst && ref.verse <= kjvFirst + last - first
    if (toKjv && inNative) return { book: ref.book, chapter: kjvChapter, verse: kjvFirst + ref.verse - first }
    if (!toKjv && inKjv) return { book: ref.book, chapter: nativeChapter, verse: first + ref.verse - kjvFirst }
    // A moved passage cannot also be present at its other edition's address (e.g. WEB Rom 16:25).
    if (inNative || inKjv) otherSideOnly = true
  }
  return edition === 'LXX' || otherSideOnly ? null : { ...ref }
}

export function mapPassage(ref: Passage, fromEdition: string, toEdition: string): Passage | null {
  if (fromEdition === toEdition) return { ...ref }
  const kjv = mappedRange(ref, fromEdition, true)
  return kjv && mappedRange(kjv, toEdition, false)
}

/** A split chapter opens at the first known equivalent verse in the destination. */
export function mapChapterStart(ref: Chapter, fromEdition: string, toEdition: string): Passage | null {
  const start = mapPassage({ ...ref, verse: 1 }, fromEdition, toEdition)
  if (start || (fromEdition !== 'LXX' && toEdition !== 'LXX')) return start

  let firstVerse = Infinity
  let target: Passage | null = null
  for (const [nativeChapter, first, last, kjvChapter, kjvFirst] of swete[ref.book] ?? []) {
    for (let offset = 0; offset <= last - first; offset++) {
      const native = { book: ref.book, chapter: nativeChapter, verse: first + offset }
      const kjv = { book: ref.book, chapter: kjvChapter, verse: kjvFirst + offset }
      const source = fromEdition === 'LXX' ? native : mappedRange(kjv, fromEdition, false)
      if (!source || source.chapter !== ref.chapter || source.verse >= firstVerse) continue
      const dest = toEdition === 'LXX' ? native : mappedRange(kjv, toEdition, false)
      if (dest) {
        firstVerse = source.verse
        target = dest
      }
    }
  }
  return target
}

export function mapChapter(ref: Chapter, fromEdition: string, toEdition: string): Chapter | null {
  const start = mapChapterStart(ref, fromEdition, toEdition)
  return start && { book: start.book, chapter: start.chapter }
}
