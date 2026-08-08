import { contextBridge, ipcRenderer } from 'electron'
import type { BibleApi } from '../shared/types'

const api: BibleApi = {
  listTranslations: () => ipcRenderer.invoke('bible:listTranslations'),
  getChapter: (ref) => ipcRenderer.invoke('bible:getChapter', ref),
  getStrongs: (id) => ipcRenderer.invoke('bible:getStrongs', id),
  getConcordance: (strongs, opts) => ipcRenderer.invoke('bible:getConcordance', strongs, opts),
  search: (query) => ipcRenderer.invoke('bible:search', query),

  listHighlights: (ref) => ipcRenderer.invoke('user:listHighlights', ref),
  saveHighlight: (input) => ipcRenderer.invoke('user:saveHighlight', input),
  deleteHighlight: (id) => ipcRenderer.invoke('user:deleteHighlight', id),

  listNotes: (ref) => ipcRenderer.invoke('user:listNotes', ref),
  saveNote: (input) => ipcRenderer.invoke('user:saveNote', input),
  deleteNote: (id) => ipcRenderer.invoke('user:deleteNote', id)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback when contextIsolation is disabled)
  window.api = api
}

export type PreloadApi = BibleApi
