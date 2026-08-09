import { contextBridge, ipcRenderer } from 'electron'
import type { AiApi, BibleApi } from '../shared/types'

const api: BibleApi = {
  listTranslations: () => ipcRenderer.invoke('bible:listTranslations'),
  getChapter: (ref) => ipcRenderer.invoke('bible:getChapter', ref),
  getStrongs: (id) => ipcRenderer.invoke('bible:getStrongs', id),
  getLexiconEntries: (strongs) => ipcRenderer.invoke('bible:getLexiconEntries', strongs),
  getConcordance: (strongs, opts) => ipcRenderer.invoke('bible:getConcordance', strongs, opts),
  listEditions: () => ipcRenderer.invoke('bible:listEditions'),
  getInterlinear: (book, chapter, edition) =>
    ipcRenderer.invoke('bible:getInterlinear', book, chapter, edition),
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
  deleteImportedTranslation: (id) => ipcRenderer.invoke('user:deleteImportedTranslation', id)
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
  chat: (messages, grounding) => ipcRenderer.invoke('ai:chat', messages, grounding),
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

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('ai', ai)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when contextIsolation is disabled)
  window.api = api
  // @ts-ignore
  window.ai = ai
}

export type PreloadApi = BibleApi
export type PreloadAi = AiApi
