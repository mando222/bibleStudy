import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { BOOK_BY_ID, BOOKS } from '../shared/books'
import { listAllNotes, listAllHighlights } from './db/user'

const BOOK_RANK: Record<string, number> = Object.fromEntries(BOOKS.map((b, i) => [b.id, i]))
const bookName = (id: string): string => BOOK_BY_ID[id]?.name ?? id

/** Build a Markdown document of all notes and highlights, grouped by book → chapter → verse. */
function buildMarkdown(): string {
  const notes = listAllNotes()
  const highlights = listAllHighlights()
  const lines: string[] = ['# Open Bible Study — Notes & Highlights', '']

  // Collect every referenced (book, chapter) in canonical order.
  const chapterKeys = new Set<string>()
  for (const n of notes) chapterKeys.add(`${n.book}.${n.chapter}`)
  for (const h of highlights) chapterKeys.add(`${h.book}.${h.chapter}`)
  const ordered = [...chapterKeys].sort((a, b) => {
    const [ab, ac] = a.split('.')
    const [bb, bc] = b.split('.')
    return (BOOK_RANK[ab] ?? 999) - (BOOK_RANK[bb] ?? 999) || Number(ac) - Number(bc)
  })

  if (!ordered.length) return lines.concat('_No notes or highlights yet._', '').join('\n')

  for (const key of ordered) {
    const [book, chapStr] = key.split('.')
    const chapter = Number(chapStr)
    lines.push(`## ${bookName(book)} ${chapter}`, '')
    const chNotes = notes.filter((n) => n.book === book && n.chapter === chapter)
    const chHls = highlights.filter((h) => h.book === book && h.chapter === chapter)
    for (const n of chNotes) {
      lines.push(`- **${bookName(book)} ${chapter}:${n.verse}** — ${n.body.replace(/\n+/g, ' ')}`)
    }
    for (const h of chHls) {
      const span = h.startToken != null ? ` (tokens ${h.startToken}–${h.endToken ?? h.startToken})` : ''
      lines.push(`- _highlight_ ${bookName(book)} ${chapter}:${h.verse}${span} — ${h.color}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Save all notes & highlights to a Markdown file the user picks. Returns the path, or null. */
export async function exportMarkdown(win: BrowserWindow | null): Promise<string | null> {
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export notes & highlights',
    defaultPath: 'open-bible-study-notes.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, buildMarkdown(), 'utf8')
  return res.filePath
}
