import { contextBridge, ipcRenderer } from 'electron'
import type { AiApi, BibleApi, NotebookApi, UpdatesApi } from '../shared/types'

const api: BibleApi = {
  version: () => ipcRenderer.invoke('app:version'),
  listTranslations: () => ipcRenderer.invoke('bible:listTranslations'),
  getChapter: (ref) => ipcRenderer.invoke('bible:getChapter', ref),
  getStrongs: (id) => ipcRenderer.invoke('bible:getStrongs', id),
  browseLexicon: (opts) => ipcRenderer.invoke('bible:browseLexicon', opts),
  getPeople: (query, limit) => ipcRenderer.invoke('bible:getPeople', query, limit),
  getPerson: (id) => ipcRenderer.invoke('bible:getPerson', id),
  getAncestry: (id) => ipcRenderer.invoke('bible:getAncestry', id),
  getPlaces: () => ipcRenderer.invoke('bible:getPlaces'),
  getPlaceVerses: (id) => ipcRenderer.invoke('bible:getPlaceVerses', id),
  getEvents: () => ipcRenderer.invoke('bible:getEvents'),
  getMapLand: () => ipcRenderer.invoke('bible:getMapLand'),
  getMapRegions: () => ipcRenderer.invoke('bible:getMapRegions'),
  getCrossReferences: (book, chapter, verse) =>
    ipcRenderer.invoke('bible:getCrossReferences', book, chapter, verse),
  getVocab: (language, limit, offset) =>
    ipcRenderer.invoke('bible:getVocab', language, limit, offset),
  getGrammarLessons: () => ipcRenderer.invoke('bible:getGrammarLessons'),
  getGrammarLesson: (id) => ipcRenderer.invoke('bible:getGrammarLesson', id),
  getLexiconEntries: (strongs) => ipcRenderer.invoke('bible:getLexiconEntries', strongs),
  getLexiconByWord: (word) => ipcRenderer.invoke('bible:getLexiconByWord', word),
  getConcordance: (strongs, opts) => ipcRenderer.invoke('bible:getConcordance', strongs, opts),
  listEditions: () => ipcRenderer.invoke('bible:listEditions'),
  getInterlinear: (book, chapter, edition, translations, includeParses) =>
    ipcRenderer.invoke('bible:getInterlinear', book, chapter, edition, translations, includeParses),
  getChapterApparatus: (book, chapter) =>
    ipcRenderer.invoke('bible:getChapterApparatus', book, chapter),
  search: (query) => ipcRenderer.invoke('bible:search', query),

  listHighlights: (ref) => ipcRenderer.invoke('user:listHighlights', ref),
  saveHighlight: (input) => ipcRenderer.invoke('user:saveHighlight', input),
  deleteHighlight: (id) => ipcRenderer.invoke('user:deleteHighlight', id),

  listNotes: (ref) => ipcRenderer.invoke('user:listNotes', ref),
  saveNote: (input) => ipcRenderer.invoke('user:saveNote', input),
  deleteNote: (id) => ipcRenderer.invoke('user:deleteNote', id),

  importTranslation: () => ipcRenderer.invoke('user:importTranslation'),
  deleteImportedTranslation: (id) => ipcRenderer.invoke('user:deleteImportedTranslation', id),

  listBookmarks: () => ipcRenderer.invoke('user:listBookmarks'),
  addBookmark: (input) => ipcRenderer.invoke('user:addBookmark', input),
  deleteBookmark: (id) => ipcRenderer.invoke('user:deleteBookmark', id),
  addHistory: (book, chapter, verse) =>
    ipcRenderer.invoke('user:addHistory', book, chapter, verse),
  listHistory: (limit) => ipcRenderer.invoke('user:listHistory', limit),

  listDueCards: (language, limit) => ipcRenderer.invoke('user:listDueCards', language, limit),
  reviewCard: (strongs, language, grade) =>
    ipcRenderer.invoke('user:reviewCard', strongs, language, grade),
  seenCards: (language) => ipcRenderer.invoke('user:seenCards', language),
  srsStats: (language) => ipcRenderer.invoke('user:srsStats', language),
  getLearnProgress: (module) => ipcRenderer.invoke('user:getLearnProgress', module),
  setLearnProgress: (module, key, value) =>
    ipcRenderer.invoke('user:setLearnProgress', module, key, value),

  exportMarkdown: () => ipcRenderer.invoke('user:exportMarkdown')
}

const ai: AiApi = {
  status: () => ipcRenderer.invoke('ai:status'),
  setConfig: (patch) => ipcRenderer.invoke('ai:setConfig', patch),
  setupBundled: () => ipcRenderer.invoke('ai:setupBundled'),
  onSetupProgress: (cb) => {
    const listener = (_e: unknown, p: Parameters<typeof cb>[0]): void => cb(p)
    ipcRenderer.on('ai:setupProgress', listener)
    return () => ipcRenderer.removeListener('ai:setupProgress', listener)
  },
  chat: (conversationId, messages, grounding, extraContext, activeContext) =>
    ipcRenderer.invoke('ai:chat', conversationId, messages, grounding, extraContext, activeContext),
  stop: (conversationId) => ipcRenderer.invoke('ai:stop', conversationId),
  complete: (messages, grounding, activeContext) =>
    ipcRenderer.invoke('ai:complete', messages, grounding, activeContext),
  onToken: (cb) => {
    const listener = (_e: unknown, ev: Parameters<typeof cb>[0]): void => cb(ev)
    ipcRenderer.on('ai:token', listener)
    return () => ipcRenderer.removeListener('ai:token', listener)
  },
  listDocuments: () => ipcRenderer.invoke('ai:listDocuments'),
  importDocument: () => ipcRenderer.invoke('ai:importDocument'),
  setDocumentActive: (id, active) => ipcRenderer.invoke('ai:setDocumentActive', id, active),
  deleteDocument: (id) => ipcRenderer.invoke('ai:deleteDocument', id),
  indexStatus: (translation) => ipcRenderer.invoke('ai:indexStatus', translation),
  buildBibleIndex: (translation) => ipcRenderer.invoke('ai:buildBibleIndex', translation),
  onIndexProgress: (cb) => {
    const listener = (_e: unknown, s: Parameters<typeof cb>[0]): void => cb(s)
    ipcRenderer.on('ai:indexProgress', listener)
    return () => ipcRenderer.removeListener('ai:indexProgress', listener)
  }
}

const notebook: NotebookApi = {
  list: () => ipcRenderer.invoke('notebook:list'),
  read: (name) => ipcRenderer.invoke('notebook:read', name),
  write: (name, content) => ipcRenderer.invoke('notebook:write', name, content),
  rename: (oldName, newName) => ipcRenderer.invoke('notebook:rename', oldName, newName),
  delete: (name) => ipcRenderer.invoke('notebook:delete', name),
  getFolder: () => ipcRenderer.invoke('notebook:getFolder'),
  chooseFolder: () => ipcRenderer.invoke('notebook:chooseFolder'),
  openWindow: () => ipcRenderer.invoke('notebook:openWindow')
}

const updates: UpdatesApi = {
  check: (force) => ipcRenderer.invoke('updates:check', force),
  getPrefs: () => ipcRenderer.invoke('updates:getPrefs'),
  setPrefs: (patch) => ipcRenderer.invoke('updates:setPrefs', patch),
  dismiss: (version) => ipcRenderer.invoke('updates:dismiss', version),
  openDownload: (url) => ipcRenderer.invoke('updates:openDownload', url)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('ai', ai)
    contextBridge.exposeInMainWorld('notebook', notebook)
    contextBridge.exposeInMainWorld('updates', updates)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when contextIsolation is disabled)
  window.api = api
  // @ts-ignore
  window.ai = ai
  // @ts-ignore
  window.notebook = notebook
  // @ts-ignore
  window.updates = updates
}

export type PreloadApi = BibleApi
export type PreloadAi = AiApi
export type PreloadNotebook = NotebookApi
export type PreloadUpdates = UpdatesApi
