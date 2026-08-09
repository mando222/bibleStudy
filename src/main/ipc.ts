import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as bible from './db/bible'
import * as user from './db/user'
import type {
  ChapterRef,
  SearchQuery,
  HighlightInput,
  NoteInput
} from '../shared/types'

/** Register all IPC handlers (bible read-only + user read/write). */
export function registerIpc(): void {
  ipcMain.handle('bible:listTranslations', () => [
    ...bible.listTranslations(),
    ...user.listImported()
  ])
  ipcMain.handle('bible:getChapter', (_e, ref: ChapterRef) =>
    user.isImported(ref.translation) ? user.getImportedChapter(ref) : bible.getChapter(ref)
  )
  ipcMain.handle('bible:getStrongs', (_e, id: string) => bible.getStrongs(id))
  ipcMain.handle('bible:getConcordance', (_e, strongs: string, opts) =>
    bible.getConcordance(strongs, opts)
  )
  ipcMain.handle('bible:listEditions', () => bible.listEditions())
  ipcMain.handle('bible:getInterlinear', (_e, book: string, chapter: number, edition: string) =>
    bible.getInterlinear(book, chapter, edition)
  )
  ipcMain.handle('bible:search', (_e, q: SearchQuery) => bible.search(q))

  ipcMain.handle('user:listHighlights', (_e, ref: ChapterRef) => user.listHighlights(ref))
  ipcMain.handle('user:saveHighlight', (_e, input: HighlightInput) => user.saveHighlight(input))
  ipcMain.handle('user:deleteHighlight', (_e, id: number) => user.deleteHighlight(id))

  ipcMain.handle('user:listNotes', (_e, ref: { book: string; chapter: number }) =>
    user.listNotes(ref)
  )
  ipcMain.handle('user:saveNote', (_e, input: NoteInput) => user.saveNote(input))
  ipcMain.handle('user:deleteNote', (_e, id: number) => user.deleteNote(id))

  ipcMain.handle('user:importTranslation', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import a Bible module (MySword / e-Sword)',
      properties: ['openFile'],
      filters: [
        {
          name: 'Bible modules',
          extensions: ['mybible', 'bbl', 'bblx', 'bbli', 'sqlite', 'sqlite3', 'db', 'SQLite3']
        },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return user.importFromSqlite(res.filePaths[0])
  })
  ipcMain.handle('user:deleteImportedTranslation', (_e, id: string) => user.deleteImported(id))
}
