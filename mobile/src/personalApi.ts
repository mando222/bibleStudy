import { registerPlugin } from '@capacitor/core'
import { BOOKS, BOOK_BY_ID } from '@shared/books'
import type { BibleApi, ChapterContent, ChapterRef, ReadingChapter, NotebookApi, SearchQuery, SearchResponse, Translation, Verse, VerseRef } from '@shared/types'
import { portableReaderState } from './phonePreferences'
import { buildStudyMarkdown } from '@shared/studyMarkdown'

interface Plugin {
  call<T>(options: { operation: string; input: object }): Promise<{ value: T }>
  document<T>(options: { operation: string; input: object }): Promise<{ value: T }>
}

const personal = registerPlugin<Plugin>('Personal')
async function call<T>(operation: string, input: object = {}): Promise<T> {
  return (await personal.call<T>({ operation, input })).value
}
async function pick<T>(operation: string, input: object = {}): Promise<T> {
  return (await personal.document<T>({ operation, input })).value
}
const checkpoints = new Set<{ flush: () => Promise<void>; resume: () => void }>()
let backupBusy = false
async function checkpoint<T>(operation: () => Promise<T>): Promise<T> {
  if (backupBusy) throw new Error('A backup or restore is already running.')
  backupBusy = true
  const editors = [...checkpoints]
  try {
    await Promise.all(editors.map(editor => editor.flush()))
    return await operation()
  } finally {
    for (const editor of editors) editor.resume()
    backupBusy = false
  }
}

export const importedLibrary = {
  list: () => call<Translation[]>('imports'),
  chapters: (translation: string) => call<ReadingChapter[]>('importChapters', { translation }),
  verses: async (ref: ChapterRef) => (await call<{ verse: number }[]>('importVerseNumbers', ref)).map(row => row.verse),
  chapter: async (ref: ChapterRef): Promise<ChapterContent> => ({
    ...ref, bookName: BOOK_BY_ID[ref.book]?.name ?? ref.book,
    ...await call<Pick<ChapterContent, 'direction' | 'verses'>>('importChapter', ref)
  }),
  comparison: (ref: VerseRef) => call<Verse | null>('importVerse', ref),
  search: async (query: SearchQuery): Promise<SearchResponse> => {
    const books = query.testament === 'NT' || query.testament === 'OT' ? BOOKS.filter(b => b.testament === query.testament).map(b => b.id) : undefined
    const results = await call<SearchResponse>('importSearch', { ...query, books })
    return { ...results, hits: results.hits.map(hit => ({ ...hit, bookName: BOOK_BY_ID[hit.book]?.name ?? hit.book })) }
  }
}

export const restoreNoticeKey = 'study:restore-completed'

export const personalApi = {
  listAnnotations: () => call('markdown'),
  listNotes: ref => call('notes', ref),
  saveNote: input => call('saveNote', input),
  deleteNote: id => call('deleteNote', { id }),
  listHighlights: ref => call('highlights', ref),
  saveHighlight: input => call('saveHighlight', input),
  deleteHighlight: id => call('deleteHighlight', { id }),
  listBookmarks: () => call('bookmarks'),
  addBookmark: input => call('addBookmark', input),
  deleteBookmark: id => call('deleteBookmark', { id }),
  addHistory: (book, chapter, verse) => call('addHistory', { book, chapter, verse }),
  listHistory: (limit = 50) => call('history', { limit }),
  listDueCards: (language, limit = 100) => call('dueCards', { language, limit }),
  reviewCard: (strongs, language, grade) => call('reviewCard', { strongs, language, grade }),
  seenCards: language => call('seenCards', { language }),
  srsStats: language => call('srsStats', { language }),
  getLearnProgress: module => call('getProgress', { module }),
  setLearnProgress: (module, key, value) => call('setProgress', { module, key, value }),
  importTranslation: () => pick('importTranslation', { books: BOOKS.map(b => b.id) }),
  deleteImportedTranslation: id => call('deleteImport', { id }),
  exportMarkdown: async () => {
    const data = await call<Parameters<typeof buildStudyMarkdown>[0]>('markdown')
    return pick<string | null>('exportMarkdown', { content: buildStudyMarkdown(data) })
  },
  studyProfile: () => call('profile'),
  createStudyBackup: state => checkpoint(() => pick('backup', { state: portableReaderState(state) })),
  restoreStudyBackup: async state => {
    const result = await checkpoint(() => pick<{ recovery: string; folder: string } | null>('restore', { state: portableReaderState(state) }))
    if (result) {
      localStorage.setItem(restoreNoticeKey, '1')
      window.location.reload()
    }
    return result
  }
} satisfies Partial<BibleApi>

export const hasRecoveryBackup = () => call<boolean>('hasRecovery')
export const exportRecoveryBackup = () => pick<string | null>('exportRecovery')

export const notebookApi: NotebookApi = {
  create: name => call('notebookCreate', { name }),
  list: () => call('notebookList'),
  listDeleted: () => call('notebookListDeleted'),
  restoreDeleted: id => call('notebookRestoreDeleted', { id }),
  read: name => call('notebookRead', { name }),
  write: (name, content) => call('notebookWrite', { name, content }),
  recover: (name, content) => call('notebookRecover', { name, content }),
  rename: (oldName, newName) => call('notebookRename', { oldName, newName }),
  delete: name => call('notebookDelete', { name }),
  getFolder: () => call('notebookFolder'),
  chooseFolder: () => pick('notebookChooseFolder'),
  openWindow: async () => { window.dispatchEvent(new Event('study:open-notebook')) },
  onCheckpoint: (flush, resume) => {
    const editor = { flush, resume }; checkpoints.add(editor)
    return () => { checkpoints.delete(editor) }
  }
}
