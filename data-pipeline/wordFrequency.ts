import type { DatabaseSync } from 'node:sqlite'
import { publisherIds, type EditionWord } from './step'
import { WORD_FREQUENCY_PUNCTUATION, WORD_FREQUENCY_VERSION } from '../src/shared/wordFrequency'

type Language = 'hebrew' | 'aramaic' | 'greek'
type Gap = 'compound' | 'ambiguous-alternate' | 'unresolved-span'
interface Address {
  book: string
  chapter: number
  verse: number
  position: number
  nativeChapter: number
  nativeVerse: number
}
interface Segment {
  position: number
  start: number
  end: number
}
interface Form {
  part: number
  surface: string
  form: string
  morph: string
  translit: string | null
  segments: Segment[]
}
interface HebrewPart extends Form {
  root: boolean
  links: Map<string, { alternate: boolean; joinsNext: boolean }>
}
export interface HebrewWord extends Address {
  language: Language
  parts: HebrewPart[]
  uncertainAliases: string[]
}

function hebrewForm(surface: string): string {
  // Presentation groups retain consonants, vowels, shin/sin dots and dagesh. The exact
  // attested spelling with cantillation and meteg is independently preserved on every row.
  return surface.replace(/[\u0591-\u05af\u05bd]/g, '').normalize('NFC')
}

export function parseHebrewFrequency(c: string[], refType: string, address: Address): HebrewWord | null {
  if (!/^(?:L[A-Z]*|Q)(?:$|\()/.test(refType)) return null
  const surfaceParts = c[1].split('/')
  const tags = c[4].split('/')
  const morphology = c[5].split('/')
  const transliterations = c[2].split('/')
  const lang = c[5][0]
  if (lang !== 'H' && lang !== 'A') {
    if (c[4].trim()) throw new Error(`Missing TAHOT language at ${c[0]}`)
    return null
  }
  if (surfaceParts.length !== tags.length || morphology.length !== tags.length) {
    throw new Error(`Unaligned TAHOT segmentation at ${c[0]}`)
  }
  const parts: HebrewPart[] = []
  // original_tokens strips outer whitespace after removing the slash separators.
  const joined = surfaceParts.join('')
  let offset = joined.trimStart().length - joined.length
  for (const [part, text] of surfaceParts.entries()) {
    const tag = tags[part].split('\\')[0].trim()
    // A backslash separates a punctuation item from a lexical item. A maqqef may also
    // join two portions of a single tagged proper name (e.g. Gen 14:17, Kedor-laomer).
    const lexical = /^[^\\]*(?:\\־[א-ת][^\\]*)?/u.exec(text)![0]
    const surface = lexical.trim().replace(/\\/g, '')
    const start = offset + lexical.length - lexical.trimStart().length
    offset += text.length
    if (!surface || !tag) continue
    const ids = publisherIds(tag)
    if (ids.length !== 1) throw new Error(`Unexpected TAHOT lexical tag at ${c[0]}: ${tag}`)
    // Punctuation can appear as a slash-delimited part or in an alternate tag field.
    if (WORD_FREQUENCY_PUNCTUATION.test(ids[0])) continue
    const root = tag.includes('{')
    const links: HebrewPart['links'] = new Map([[ids[0], { alternate: false, joinsNext: tag.endsWith('+') }]])
    const morph = part ? lang + morphology[part] : morphology[0]
    const translit = transliterations.length === tags.length ? transliterations[part].trim().replace(/-$/, '') : ''
    parts.push({
      part, root, links, surface, morph,
      form: hebrewForm(surface),
      translit: translit || null,
      segments: [{ position: address.position, start, end: start + lexical.trim().length }]
    })
  }
  const roots = parts.filter(part => part.root)
  const uncertainAliases = new Set<string>()
  // An alternative may describe a Ketiv or another variant. Its simple ID is not positive
  // evidence for this Qere/Leningrad spelling unless the tag is independently on the main form.
  const distinctReading = refType !== 'L' || Boolean(c[6].trim())
  for (const field of c[9].split(',')) {
    for (const id of publisherIds(field)) {
      if (WORD_FREQUENCY_PUNCTUATION.test(id) || parts.some(part => part.links.has(id))) continue
      if (distinctReading || roots.length !== 1) uncertainAliases.add(id)
      else roots[0].links.set(id, { alternate: true, joinsNext: field.trim().endsWith('+') })
    }
  }
  return { ...address, language: lang === 'A' ? 'aramaic' : 'hebrew', parts, uncertainAliases: [...uncertainAliases] }
}

export class WordFrequencyIndex {
  private readonly write
  private readonly chapters = new Map<string, number>()
  private readonly gaps = new Map<string, number>()
  constructor(private readonly db: DatabaseSync) {
    this.write = db.prepare(`INSERT INTO word_frequency_occurrences
      (edition,strongs,book_id,chapter,verse,position,part,native_chapter,native_verse,language,
       surface,form,morph,translit,alternate,surface_start,surface_end,segments)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  }

  private tagPosition(edition: string, language: Language, a: Address) {
    const key = [edition, language, a.book, a.nativeChapter].join('|')
    this.chapters.set(key, (this.chapters.get(key) ?? 0) + 1)
  }

  private gap(edition: string, ids: string[], reason: Gap) {
    for (const id of new Set(ids)) {
      const key = [edition, id, reason].join('|')
      this.gaps.set(key, (this.gaps.get(key) ?? 0) + 1)
    }
  }

  private record(edition: string, id: string, language: Language, a: Address, f: Form, alternate: boolean) {
    const first = f.segments[0]
    this.write.run(
      edition, id, a.book, a.chapter, a.verse, a.position, f.part, a.nativeChapter, a.nativeVerse, language,
      f.surface, f.form, f.morph, f.translit, alternate ? 1 : 0, first.start, first.end,
      f.segments.length > 1 ? JSON.stringify(f.segments) : null
    )
  }

  greek(book: string, chapter: number, verse: number, position: number, w: EditionWord) {
    const a = { book, chapter, verse, position, nativeChapter: w.nativeChapter, nativeVerse: w.nativeVerse }
    this.gap(w.edition, w.uncertainAliases, 'ambiguous-alternate')
    const ids = publisherIds(w.analysis)
    if (w.uncertainSpellingTag) {
      this.gap(w.edition, ids, 'ambiguous-alternate')
      return
    }
    // Retain the apostrophe of elision. Discard only surrounding editorial punctuation.
    const match = /[^\s.,··;;:?!¶\[\]¬«»“”][\s\S]*?(?=[\s.,··;;:?!¶\[\]¬«»“”]*$)/u.exec(w.original)
    if (!match?.[0]) throw new Error(`Unrecognized TAGNT form at ${book} ${chapter}.${verse}`)
    const surface = match[0]
    const f: Form = {
      part: 0,
      surface,
      form: surface.toLocaleLowerCase('el').normalize('NFC'),
      morph: w.morph ?? '',
      translit: w.publisherTranslit,
      segments: [{ position, start: match.index, end: match.index + surface.length }]
    }
    if (w.strongs && w.morph) {
      this.record(w.edition, w.strongs, 'greek', a, f, false)
      for (const id of w.aliases) this.record(w.edition, id, 'greek', a, f, true)
    } else {
      // The publisher can tag one fused word as either several constituents or one
      // traditional dictionary ID (e.g. κἂν, G2579). Only the latter has an exact whole
      // surface. The constituent tags need not be in surface order and cannot be divided
      // into verified spans. Do not assert a whole-word morphology from constituent parses.
      this.gap(w.edition, ids, 'compound')
      if (w.analysis.includes(' + ') && !/\s/u.test(surface) && w.aliases.length === 1) {
        this.record(w.edition, w.aliases[0], 'greek', a, f, true)
      } else {
        this.gap(w.edition, w.aliases, 'compound')
        return
      }
    }
    this.tagPosition(w.edition, 'greek', a)
  }

  hebrewVerse(words: HebrewWord[]) {
    // A '+' on a lexical tag says it also covers the next word. Resolve each ID separately:
    // the joined place name and an alternate tag for a single constituent have different spans.
    const roots = words.flatMap(word => word.parts.filter(part => part.root).map(part => ({ word, part })))
    const rootIndices = new Map(roots.map(({ part }, i) => [part, i]))
    const consumed = new Map<HebrewPart, Set<string>>()
    for (const word of words) {
      this.gap('MT', word.uncertainAliases, 'ambiguous-alternate')
      if (word.parts.length) this.tagPosition('MT', word.language, word)
      for (const part of word.parts) {
        for (const [id, link] of part.links) {
          if (consumed.get(part)?.has(id)) continue
          const chain = [part]
          let joins = link.joinsNext
          let i = rootIndices.get(part)
          while (joins && i !== undefined) {
            const next = roots[++i]
            const nextLink = next?.part.links.get(id)
            const lastPos = chain[chain.length - 1].segments[0].position
            if (!nextLink || next.word.position > lastPos + 1 ||
              next.word.nativeChapter !== word.nativeChapter || next.word.nativeVerse !== word.nativeVerse) break
            chain.push(next.part)
            const used = consumed.get(next.part) ?? new Set<string>()
            consumed.set(next.part, used.add(id))
            joins = nextLink.joinsNext
          }
          if (joins) {
            this.gap('MT', [id], 'unresolved-span')
            continue
          }
          let f: Form = part
          if (chain.length > 1) {
            const morphs = [...new Set(chain.map(item => item.morph))]
            f = {
              part: part.part,
              surface: chain.map(item => item.surface).join(' '),
              form: chain.map(item => item.form).join(' '),
              morph: morphs.join(' + '),
              translit: chain.every(item => item.translit) ? chain.map(item => item.translit).join(' ') : null,
              segments: chain.flatMap(item => item.segments)
            }
          }
          this.record('MT', id, word.language, word, f, link.alternate)
        }
      }
    }
  }

  finish() {
    const chapter = this.db.prepare('INSERT INTO word_frequency_chapters VALUES (?,?,?,?,?)')
    const gap = this.db.prepare('INSERT INTO word_frequency_gaps VALUES (?,?,?,?)')
    this.db.exec('BEGIN')
    for (const [key, n] of this.chapters) {
      const [edition, language, book, ch] = key.split('|')
      chapter.run(edition, language, book, Number(ch), n)
    }
    for (const [key, n] of this.gaps) gap.run(...key.split('|'), n)
    this.db.prepare("INSERT INTO meta (key,value) VALUES ('word_frequency_version',?)").run(WORD_FREQUENCY_VERSION)
    this.db.exec('COMMIT')
  }
}
