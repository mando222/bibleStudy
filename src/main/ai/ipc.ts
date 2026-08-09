import { ipcMain, dialog, BrowserWindow } from 'electron'
import { setConfig } from './config'
import { status, setupBundled } from './provider'
import { answer } from './assistant'
import { importDocument } from './documents'
import { listDocuments, setDocumentActive, deleteDocument } from './vectors'
import { indexStatus, buildBibleIndex } from './bibleIndex'
import type { AiConfig, ChatCitation, ChatMessage } from '../../shared/types'

export function registerAiIpc(): void {
  ipcMain.handle('ai:status', () => status())

  ipcMain.handle('ai:setConfig', (_e, patch: Partial<AiConfig>) => setConfig(patch))

  // First-run: download the hardware-adapted bundled model(s) into userData, with progress.
  ipcMain.handle('ai:setupBundled', async (e) => {
    await setupBundled((p) => {
      if (!e.sender.isDestroyed()) e.sender.send('ai:setupProgress', p)
    })
    return status()
  })

  ipcMain.handle(
    'ai:chat',
    async (e, messages: ChatMessage[], grounding: { translation: string } | null) => {
      const send = (ev: unknown): void => {
        if (!e.sender.isDestroyed()) e.sender.send('ai:token', ev)
      }
      let text = ''
      let citations: ChatCitation[] = []
      try {
        for await (const part of answer(messages, grounding)) {
          if (part.citations) {
            citations = part.citations
            send({ citations })
          }
          if (part.token) {
            text += part.token
            send({ token: part.token })
          }
        }
        send({ done: true })
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err), done: true })
      }
      return { text, citations }
    }
  )

  // ---- Documents (RAG) ----
  ipcMain.handle('ai:listDocuments', () => listDocuments())
  ipcMain.handle('ai:importDocument', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, {
      title: 'Add a document for the assistant',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'markdown', 'csv', 'text'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return importDocument(res.filePaths[0])
  })
  ipcMain.handle('ai:setDocumentActive', (_e, id: string, active: boolean) =>
    setDocumentActive(id, active)
  )
  ipcMain.handle('ai:deleteDocument', (_e, id: string) => deleteDocument(id))

  // Bible semantic index (hybrid retrieval)
  ipcMain.handle('ai:indexStatus', (_e, translation: string) => indexStatus(translation))
  ipcMain.handle('ai:buildBibleIndex', async (e, translation: string) => {
    await buildBibleIndex(translation, (s) => {
      if (!e.sender.isDestroyed()) e.sender.send('ai:indexProgress', s)
    })
  })
}
