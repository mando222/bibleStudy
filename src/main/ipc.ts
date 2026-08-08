import { ipcMain } from 'electron'
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
  ipcMain.handle('bible:listTranslations', () => bible.listTranslations())
  ipcMain.handle('bible:getChapter', (_e, ref: ChapterRef) => bible.getChapter(ref))
  ipcMain.handle('bible:getStrongs', (_e, id: string) => bible.getStrongs(id))
  ipcMain.handle('bible:getConcordance', (_e, strongs: string, opts) =>
    bible.getConcordance(strongs, opts)
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
}
