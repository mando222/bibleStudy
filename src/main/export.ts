import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { buildStudyMarkdown } from '../shared/studyMarkdown'
import { listAllNotes, listAllHighlights, listImported } from './db/user'

/** Save all notes & highlights to a Markdown file the user picks. Returns the path, or null. */
export async function exportMarkdown(win: BrowserWindow | null): Promise<string | null> {
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export notes & highlights',
    defaultPath: 'open-bible-study-notes.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (res.canceled || !res.filePath) return null
  writeFileSync(res.filePath, buildStudyMarkdown({ notes: listAllNotes(), highlights: listAllHighlights(), imports: listImported() }), 'utf8')
  return res.filePath
}
