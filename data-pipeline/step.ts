// STEPBible's reference before the brackets is NRSV. TAGNT uses [ ] for KJV,
// ( ) for NA and { } for another tradition. TAHOT uses ( ) for native Hebrew.
import { normStrongs, translitGreek } from './lib'

export function parseStepReference(value: string) {
  const match = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)((?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})*)#(\d+)(?:=(\S+))?$/.exec(
    value
  )
  if (!match) return null
  const alternate = (pattern: RegExp) => {
    const found = pattern.exec(match[4])
    return found ? { chapter: Number(found[1]), verse: Number(found[2]) } : null
  }
  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
    position: Number(match[5]),
    type: match[6] || '',
    kjv: alternate(/\[(\d+)\.(\d+)/),
    native: alternate(/\((\d+)\.(\d+)/)
  }
}

const GREEK_EDITIONS: Record<string, string> = { NA28: 'NA', TR: 'TR', Byz: 'BYZ' }

interface Reading {
  original: string
  translit: string | null
  strongs: string | null
  morph: string | null
  gloss: string | null
}
export interface EditionWord extends Reading {
  edition: string
  order: number
  nativeChapter: number
  nativeVerse: number
  analysis: string
  aliases: string[]
  uncertainAliases: string[]
  publisherTranslit: string | null
  uncertainSpellingTag: boolean
}

/** The numeric dictionary entry, excluding STEPBible's disambiguation and verse-instance suffix. */
export function publisherIds(field: string): string[] {
  return [...new Set(Array.from(field.matchAll(/([GH])0*(\d+)/g), match => match[1] + Number(match[2])))]
}

export function greekReadings(
  c: string[],
  ref: NonNullable<ReturnType<typeof parseStepReference>>
): EditionWord[] {
  const words = new Map<string, EditionWord>()
  const directIds = new Set<string>()
  const add = (original: string, translit: string, gloss: string, analysis: string, editions: string) => {
    // Several alternatives are translated as a single phrase with multiple analyses.
    // Preserve the supplied phrase. The tag list is not in Greek surface order.
    const compound = analysis.includes(' + ')
    const [strongs, morph] = analysis.split('=')
    for (const id of publisherIds(analysis)) directIds.add(id)
    const reading: Reading = {
      original: original.replace(/¶/g, '').trim(),
      translit: translit || null,
      gloss: gloss.replace(/^(?:\{[^}]+\}|\[[\d.]+\]|\([\d.]+\))\s*/, '').trim() || null,
      strongs: compound ? null : normStrongs(strongs),
      morph: compound ? null : morph || null
    }
    for (const label of editions.trim().split('+')) {
      const m = /^(NA28|TR|Byz)(?:([«»])(\d+)(?:\.(\d+))?)?$/.exec(label)
      if (!m) continue
      const edition = GREEK_EDITIONS[m[1]]
      const native = (edition === 'NA' ? ref.native : edition === 'TR' ? ref.kjv : null) ?? ref
      let order = ref.position
      if (m[2] && !m[4]) {
        // Both arrows specify the anchor after which to place the moved word.
        order += (m[2] === '«' ? -1 : 1) * Number(m[3]) + 0.5
      }
      words.set(edition, {
        ...reading,
        analysis,
        publisherTranslit: reading.translit,
        uncertainSpellingTag: false,
        aliases: [],
        uncertainAliases: [],
        edition,
        order,
        nativeChapter: m[4] ? Number(m[3]) : native.chapter,
        nativeVerse: m[4] ? Number(m[4]) : native.verse
      })
    }
  }

  const primary = /^(.*?)\s+\((.*)\)\s*$/.exec(c[1])
  add(primary?.[1] ?? c[1], primary?.[2] ?? '', c[2], c[3], c[5])
  for (const alt of (c[6] || '').split(' ¦ ').filter(Boolean)) {
    const m = /^(.+?) \([^=()]+=([^()]*)\) (.*?) - (.+?) in: (.+)$/.exec(alt)
    if (!m) throw new Error(`Unknown TAGNT reading at ${c[0]}: ${alt}`)
    add(m[1], m[2], m[3], m[4], m[5])
  }
  for (const variant of (c[7] || '').split(';')) {
    const spelling = /^\s*([^:]+):\s*(\S.*?)\s*$/.exec(variant)
    if (!spelling) continue
    for (const label of spelling[1].trim().split('+')) {
      const word = words.get(GREEK_EDITIONS[label])
      if (word) {
        // Some "spelling" variants are distinct lexical forms or contractions. When
        // TAGNT supplies alternate ids on the same row but never assigns them to those
        // spellings, the changed form has no certain individual dictionary link.
        word.uncertainSpellingTag = word.original !== spelling[2] && Boolean(c[12]?.trim())
        word.original = spelling[2]
        word.translit = translitGreek(word.original)
        word.publisherTranslit = null
      }
    }
  }
  // These two columns belong to the source ROW, which can represent several readings.
  // An alternate ID already explained by a different explicit reading must not be transferred
  // to this one. With differing readings, other row-level aliases have no edition assignment.
  const aliases = publisherIds([c[11], c[12]].join(' ')).filter(id => !directIds.has(id))
  for (const word of words.values()) {
    if (c[6]?.trim() || c[7]?.trim()) word.uncertainAliases = aliases
    else word.aliases = aliases
  }
  return [...words.values()]
}
