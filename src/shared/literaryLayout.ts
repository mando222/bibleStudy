import type { VerseSegment } from './sourceWords'
import type { Verse } from './types'

/** Positions address the published verse, in the same UTF-16 units as JS strings and DOM ranges. */
export type LayoutMark =
  | { at: number; kind: 'heading'; text: string }
  | { at: number; kind: 'superscription'; text: string }
  | { at: number; kind: 'line'; blank?: boolean }
  | { at: number; kind: 'paragraph'; style: string }
  | { at: number; kind: 'poetry'; indent: number }
  | { at: number; kind: 'descriptive'; end: number }
  | { at: number; kind: 'speaker'; end: number; continuation: boolean }

export type VerseLayout = LayoutMark[]

/** Use only this edition's recorded layout, retaining verse addresses for passage comparisons. */
export function describeLayout(verses: readonly Verse[], includeVerseNumbers = true): string[] {
  const descriptions: string[] = []
  for (const verse of verses) {
    const marks = verse.layout ?? []
    const poetry = marks.filter(m => m.kind === 'poetry')
    const add = (label: string) => descriptions.push(includeVerseNumbers ? `v. ${verse.verse} · ${label}` : label)
    for (const mark of marks) {
      switch (mark.kind) {
        case 'heading': add(`Publisher heading: ${mark.text}`); break
        case 'superscription': add(`Superscription: ${mark.text}`); break
        case 'descriptive': add(`Descriptive text: ${verse.text.slice(mark.at, mark.end)}`); break
        case 'paragraph': add(`Paragraph begins “${excerpt(verse.text, mark.at)}”`); break
        case 'line':
          if (mark.blank) add(mark.at === 0 ? 'Blank line before verse' : `Blank line before “${excerpt(verse.text, mark.at)}”`)
          else if (!poetry.some(p => p.at === mark.at)) add(mark.at === 0 ? 'Line break before verse' : `Line break before “${excerpt(verse.text, mark.at)}”`)
          break
      }
    }
    if (poetry.length) {
      const starts = poetry.map((mark, i) => {
        const line = verse.text.slice(mark.at, poetry[i + 1]?.at).trim()
        return `“${excerpt(line, 0)}” (indent ${mark.indent})`
      })
      add(`${poetry.length} poetic ${poetry.length === 1 ? 'line' : 'lines'} · ${starts.join(' / ')}`)
    }
  }
  return descriptions
}

function excerpt(text: string, at: number): string {
  const words = text.slice(at).trim().split(/\s+/)
  return words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : '')
}

export interface LiteraryGroup {
  marks: LayoutMark[]
  parts: VerseSegment[]
  descriptive: boolean
}

/** Split on original-text positions. A verified restored span remains an indivisible link. */
export function literaryGroups(parts: VerseSegment[], layout: VerseLayout, literary: boolean, speakers: boolean, headings = literary): LiteraryGroup[] {
  const byOffset = new Map<number, LayoutMark[]>()
  const indices = new Set([0])
  const descriptions: [number, number][] = []
  for (const mark of layout) {
    if (mark.kind === 'speaker') {
      if (!speakers || mark.continuation) continue
    } else if (mark.kind === 'heading') {
      if (!headings) continue
    } else if (!literary && mark.kind !== 'superscription') {
      continue
    }
    const marks = byOffset.get(mark.at) ?? []
    marks.push(mark)
    byOffset.set(mark.at, marks)
    indices.add(mark.at)
    if (mark.kind === 'descriptive') {
      descriptions.push([mark.at, mark.end])
      indices.add(mark.end)
    }
  }
  if (indices.size === 1) return [{ marks: byOffset.get(0) ?? [], parts, descriptive: descriptions.some(([start]) => start === 0) }]
  // Some words span several English tokens in the restoration. Do not split an attested word
  // for a formatting marker. Its published spelling still participates in offset calculations.
  let end = 0
  for (const part of parts) {
    const start = end
    end += part.original.length
    if (part.original !== part.display) {
      for (const at of indices) if (start < at && at < end) indices.delete(at)
    }
  }
  const cuts = [...indices].filter(at => at >= 0 && at <= end).sort((a, b) => a - b)
  const groups: LiteraryGroup[] = cuts.map(at => ({
    marks: byOffset.get(at) ?? [], parts: [], descriptive: descriptions.some(([a, b]) => a <= at && at < b)
  }))
  let group = 0
  let position = 0
  for (const part of parts) {
    const finish = position + part.original.length
    let from = position
    while (from < finish) {
      if (cuts[group + 1] === from) group++
      const to = Math.min(finish, cuts[group + 1] ?? finish)
      if (from === position && to === finish) groups[group].parts.push(part)
      else {
        const slice = part.original.slice(from - position, to - position)
        groups[group].parts.push({ original: slice, display: slice, token: to === finish ? part.token : undefined })
      }
      from = to
    }
    position = finish
  }
  return groups
}
