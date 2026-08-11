import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as bible from './db/bible'
import * as graph from './db/graph'
import * as user from './db/user'
import { exportMarkdown } from './export'
import type {
  ChapterRef,
  SearchQuery,
  HighlightInput,
  NoteInput
} from '../shared/types'

/** Register all IPC handlers (bible read-only + user read/write). */
export function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('bible:listTranslations', () => [
    ...bible.listTranslations(),
    ...user.listImported()
  ])
  ipcMain.handle('bible:getChapter', (_e, ref: ChapterRef) =>
    user.isImported(ref.translation) ? user.getImportedChapter(ref) : bible.getChapter(ref)
  )
  ipcMain.handle('bible:getStrongs', (_e, id: string) => bible.getStrongs(id))
  ipcMain.handle('bible:browseLexicon', (_e, opts) => bible.browseLexicon(opts))
  ipcMain.handle('bible:getPeople', (_e, q: string, limit: number) => graph.getPeople(q, limit))
  ipcMain.handle('bible:getPerson', (_e, id: number) => graph.getPerson(id))
  ipcMain.handle('bible:getAncestry', (_e, id: number) => graph.getAncestry(id))
  ipcMain.handle('bible:getPlaces', () => graph.getPlaces())
  ipcMain.handle('bible:getPlaceVerses', (_e, id: number) => graph.getPlaceVerses(id))
  ipcMain.handle('bible:getEvents', () => graph.getEvents())
  ipcMain.handle('bible:getMapLand', () => bible.getMapLand())
  ipcMain.handle('bible:getMapRegions', () => bible.getMapRegions())
  ipcMain.handle('bible:getCrossReferences', (_e, book: string, ch: number, v: number) =>
    bible.getCrossReferences(book, ch, v)
  )
  ipcMain.handle('bible:getVocab', (_e, language: 'greek' | 'hebrew', limit?: number, offset?: number) =>
    bible.getVocab(language, limit, offset)
  )
  ipcMain.handle('bible:getGrammarLessons', () => bible.getGrammarLessons())
  ipcMain.handle('bible:getGrammarLesson', (_e, id: number) => bible.getGrammarLesson(id))
  ipcMain.handle('bible:getLexiconEntries', (_e, strongs: string) =>
    bible.getLexiconEntries(strongs)
  )
  ipcMain.handle('bible:getLexiconByWord', (_e, word: string) => bible.getLexiconByWord(word))
  ipcMain.handle('bible:getConcordance', (_e, strongs: string, opts) =>
    bible.getConcordance(strongs, opts)
  )
  ipcMain.handle('bible:listEditions', () => bible.listEditions())
  ipcMain.handle(
    'bible:getInterlinear',
    (_e, book: string, chapter: number, edition: string, translations?: string[], includeParses?: boolean) =>
      bible.getInterlinear(book, chapter, edition, translations ?? [], includeParses ?? false)
  )
  ipcMain.handle('bible:getChapterApparatus', (_e, book: string, chapter: number) =>
    bible.getChapterApparatus(book, chapter)
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

  // Bookmarks & reading history
  ipcMain.handle('user:listBookmarks', () => user.listBookmarks())
  ipcMain.handle(
    'user:addBookmark',
    (_e, input: { name: string; book: string; chapter: number; verse?: number; note?: string }) =>
      user.addBookmark(input)
  )
  ipcMain.handle('user:deleteBookmark', (_e, id: number) => user.deleteBookmark(id))
  ipcMain.handle('user:addHistory', (_e, book: string, chapter: number, verse?: number) =>
    user.addHistory(book, chapter, verse)
  )
  ipcMain.handle('user:listHistory', (_e, limit?: number) => user.listHistory(limit))

  // Learn: spaced repetition + progress
  ipcMain.handle('user:listDueCards', (_e, language: string, limit?: number) =>
    user.listDueCards(language, limit)
  )
  ipcMain.handle('user:reviewCard', (_e, strongs: string, language: string, grade: number) =>
    user.reviewCard(strongs, language, grade)
  )
  ipcMain.handle('user:seenCards', (_e, language: string) => user.seenCards(language))
  ipcMain.handle('user:srsStats', (_e, language: string) => user.srsStats(language))
  ipcMain.handle('user:getLearnProgress', (_e, module: string) => user.getLearnProgress(module))
  ipcMain.handle('user:setLearnProgress', (_e, module: string, key: string, value: string) =>
    user.setLearnProgress(module, key, value)
  )

  // Export notes & highlights to Markdown
  ipcMain.handle('user:exportMarkdown', (e) =>
    exportMarkdown(BrowserWindow.fromWebContents(e.sender))
  )
}
