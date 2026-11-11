import type { LayoutMark, VerseLayout } from '../src/shared/literaryLayout'

export interface ChapterBlock {
  type?: string
  number?: number
  content?: unknown[]
  paragraph?: string
}

type NativePart = {
  text?: string; paragraph?: string; lineBreak?: boolean; heading?: string
  poem?: number; descriptive?: boolean; wordsOfJesus?: boolean
}
const partOf = (item: unknown): NativePart =>
  typeof item === 'string' ? { text: item } : item && typeof item === 'object' ? item : {}

/** This is the established verse normalization used by search, copying, and word alignment. */
function normalize(text: string): string {
  return text.replace(/`/g, '').replace(/¶/g, ' ').replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?’”'")\]])/g, '$1').replace(/([“‘("[])\s+/g, '$1').trim()
}

export function verseText(content: unknown[]): string {
  return normalize(content.map(partOf).map(p => p.text).filter((s): s is string => typeof s === 'string').join(' '))
}

export interface NativeVerse { text: string; layout: VerseLayout }
type Break = { kind: 'line'; blank?: boolean } | { kind: 'paragraph'; style: string }
const boundary = (paragraph?: string): Break => paragraph ? { kind: 'paragraph', style: paragraph } : { kind: 'line' }
type Pending = Break | { kind: 'heading' | 'superscription'; text: string }

/** Read document order, anchoring breaks and titles to the following text without folding
 * an editorial heading or separately supplied psalm title into the numbered verse. */
export function nativeChapter(content: ChapterBlock[]): Map<number, NativeVerse> {
  const verses = new Map<number, NativeVerse>()
  let pending: Pending[] = []
  let speechContinues = false
  let previous: NativeVerse | undefined
  for (const block of content) {
    if (block.type === 'line_break') { pending.push(block.paragraph ? boundary(block.paragraph) : { kind: 'line', blank: true }); continue }
    if (block.type === 'heading' || block.type === 'hebrew_subtitle') {
      const text = verseText(block.content ?? [])
      if (text) pending.push({ kind: block.type === 'heading' ? 'heading' : 'superscription', text })
      continue
    }
    if (block.type !== 'verse' || typeof block.number !== 'number' || !block.content) continue
    const text = verseText(block.content)
    if (!text) continue
    const verse = verses.get(block.number) ?? { text: '', layout: [] }
    const offset = verse.text ? verse.text.length + 1 : 0
    verse.text += (offset ? ' ' : '') + text
    const add = (mark: LayoutMark) => {
      // A KJV pilcrow and a structural paragraph marker frequently describe the same break.
      if (mark.kind === 'paragraph' && verse.layout.some(m => m.at === mark.at && m.kind === 'paragraph')) return
      verse.layout.push(mark)
    }
    let pos = 0
    let indent: number | undefined
    let lastSpeech: Extract<LayoutMark, {kind: 'speaker'}> | undefined
    for (const item of block.content.map(partOf)) {
      if (item.lineBreak) pending.push(boundary(item.paragraph))
      if (typeof item.heading === 'string') pending.push({ kind: 'heading', text: item.heading })
      if (typeof item.text !== 'string') continue
      const chunks = item.text.split('¶')
      for (let i = 0; i < chunks.length; i++) {
        if (i) pending.push(boundary('p'))
        const chunk = normalize(chunks[i])
        if (!chunk) continue
        while (text[pos] === ' ') pos++
        if (!text.startsWith(chunk, pos)) throw Error(`Cannot anchor source formatting in verse ${block.number}`)
        const at = offset + pos
        if (pending.length) {
          for (const mark of pending) add({ ...mark, at })
          pending = []
          indent = undefined
        }
        if (typeof item.poem === 'number' && item.poem !== indent) add({ kind: 'poetry', at, indent: item.poem })
        indent = item.poem
        const end = at + chunk.length
        if (item.descriptive) add({ kind: 'descriptive', at, end })
        if (item.wordsOfJesus) {
          if (lastSpeech) lastSpeech.end = end
          else {
            lastSpeech = { kind: 'speaker', at, end, continuation: speechContinues }
            add(lastSpeech)
          }
        } else lastSpeech = undefined
        speechContinues = !!item.wordsOfJesus
        pos += chunk.length
      }
    }
    if (pos !== text.length) throw Error(`Incomplete source formatting in verse ${block.number}`)
    verses.set(block.number, verse)
    previous = verse
  }
  // A trailing standalone title (e.g. a postscript) belongs after the final verse.
  if (previous) for (const mark of pending) {
    if (mark.kind === 'heading' || mark.kind === 'superscription') previous.layout.push({ ...mark, at: previous.text.length })
  }
  return verses
}
