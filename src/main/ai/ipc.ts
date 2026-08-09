import { ipcMain } from 'electron'
import { ping, listModels } from './ollama'
import { getConfig, setConfig, ensureChatModel } from './config'
import { answer } from './assistant'
import type { AiConfig, ChatCitation, ChatMessage } from '../../shared/types'

export function registerAiIpc(): void {
  ipcMain.handle('ai:status', async () => {
    const cfg = getConfig()
    const available = await ping(cfg.baseUrl)
    const models = available ? await listModels(cfg.baseUrl) : []
    const config = available ? await ensureChatModel() : cfg
    return { available, models, config }
  })

  ipcMain.handle('ai:setConfig', (_e, patch: Partial<AiConfig>) => setConfig(patch))

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

  // ---- Phase 6 (documents + semantic index) — implemented in the next stage ----
  ipcMain.handle('ai:listDocuments', () => [])
  ipcMain.handle('ai:importDocument', () => null)
  ipcMain.handle('ai:setDocumentActive', () => undefined)
  ipcMain.handle('ai:deleteDocument', () => undefined)
  ipcMain.handle('ai:indexStatus', () => ({ bibleIndexed: 0, bibleTotal: 0, building: false }))
  ipcMain.handle('ai:buildBibleIndex', () => undefined)
}
