import { BOOKS, BOOK_BY_ID } from './books'
import { mapPassage } from './passageMapping'
import type { Note, Highlight, Translation } from './types'

const BOOK_RANK: Record<string, number> = Object.fromEntries(BOOKS.map((b, i) => [b.id, i]))
const bookName = (id: string): string => BOOK_BY_ID[id]?.name ?? id
const address = (ref: { book: string; chapter: number; verse: number }) =>
  `${bookName(ref.book)} ${ref.chapter}:${ref.verse}`

/** Group annotations at verified equivalent passages. Unmapped highlights retain their edition. */
export function buildStudyMarkdown({ notes, highlights, imports }: { notes: Note[]; highlights: Highlight[]; imports: Pick<Translation, 'id' | 'name'>[] }): string {
  const importedNames = new Map(imports.map(t => [t.id, t.name]))
  const lines: string[] = ['# Open Bible Study — Notes & Highlights', '']
  type Group = { book: string; chapter: number; edition: string; rows: { verse: number; line: string }[] }
  const groups = new Map<string, Group>()
  function add(ref: { book: string; chapter: number; verse: number }, edition: string, line: string) {
    const key = JSON.stringify([ref.book, ref.chapter, edition])
    let group = groups.get(key)
    if (!group) {
      group = { book: ref.book, chapter: ref.chapter, edition, rows: [] }
      groups.set(key, group)
    }
    group.rows.push({ verse: ref.verse, line })
  }

  for (const n of notes) {
    add(n, 'KJV', `- **${address(n)}** (KJV numbering) — ${n.body.replace(/\r?\n/g, '\n  ')}`)
  }
  for (const h of highlights) {
    const canonical = mapPassage(h, h.translation, 'KJV')
    const span = h.startToken != null ? ` (tokens ${h.startToken}–${h.endToken ?? h.startToken})` : ''
    const edition = importedNames.get(h.translation) ?? h.translation
    const equivalents = canonical && address(canonical) !== address(h) ? ` · ${address(canonical)} (KJV numbering)` : ''
    add(canonical ?? h, canonical ? 'KJV' : h.translation,
      `- _highlight_ ${address(h)} (${edition})${span}${equivalents} — ${h.color}`)
  }
  if (!groups.size) return lines.concat('_No notes or highlights yet._', '').join('\n')

  const ordered = [...groups.values()].sort((a, b) =>
    (BOOK_RANK[a.book] ?? 999) - (BOOK_RANK[b.book] ?? 999) || a.chapter - b.chapter || a.edition.localeCompare(b.edition))
  for (const group of ordered) {
    const system = group.edition === 'KJV' ? 'KJV numbering' : importedNames.get(group.edition) ?? group.edition
    lines.push(`## ${bookName(group.book)} ${group.chapter} (${system})`, '',
      ...group.rows.sort((a, b) => a.verse - b.verse).map(row => row.line), '')
  }
  return lines.join('\n')
}
