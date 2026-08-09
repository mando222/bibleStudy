import {
  ping as ollamaPing,
  listModels as ollamaList,
  chatStream as ollamaChat,
  embed as ollamaEmbed
} from './ollama'
import * as llamacpp from './llamacpp'
import {
  MODELS,
  chatModelForHardware,
  modelPath,
  modelPresent,
  downloadModel,
  type ModelDef
} from './models'
import { getConfig, ensureChatModel } from './config'
import type { AiSetupProgress, AiStatus, ChatMessage } from '../../shared/types'

export type Active = 'bundled' | 'ollama' | 'none'

function bundledReady(): boolean {
  return modelPresent(MODELS.chatFast) || modelPresent(MODELS.chatBalanced)
}
function bundledChatModel(): ModelDef | null {
  if (modelPresent(MODELS.chatBalanced)) return MODELS.chatBalanced
  if (modelPresent(MODELS.chatFast)) return MODELS.chatFast
  return null
}

export async function activeProvider(): Promise<Active> {
  const cfg = getConfig()
  if (cfg.provider === 'bundled') return bundledReady() ? 'bundled' : 'none'
  if (cfg.provider === 'ollama') return (await ollamaPing(cfg.baseUrl)) ? 'ollama' : 'none'
  // auto: prefer the in-process bundled model, then a running Ollama
  if (bundledReady()) return 'bundled'
  if (await ollamaPing(cfg.baseUrl)) return 'ollama'
  return 'none'
}

export async function* chatStream(messages: ChatMessage[]): AsyncGenerator<string> {
  const active = await activeProvider()
  if (active === 'bundled') {
    const m = bundledChatModel()
    if (!m) throw new Error('The assistant isn’t set up yet.')
    yield* llamacpp.chatStream(modelPath(m), messages)
    return
  }
  if (active === 'ollama') {
    const cfg = await ensureChatModel()
    yield* ollamaChat(cfg.baseUrl, cfg.chatModel, messages)
    return
  }
  throw new Error('The assistant isn’t set up yet.')
}

export async function embed(texts: string[]): Promise<number[][]> {
  const active = await activeProvider()
  if (active === 'bundled') {
    return modelPresent(MODELS.embed) ? llamacpp.embed(modelPath(MODELS.embed), texts) : []
  }
  if (active === 'ollama') {
    const cfg = getConfig()
    return ollamaEmbed(cfg.baseUrl, cfg.embedModel, texts)
  }
  return []
}

export async function status(): Promise<AiStatus> {
  const cfg = getConfig()
  const ollamaUp = await ollamaPing(cfg.baseUrl)
  const ready = bundledReady()
  const active: Active =
    cfg.provider === 'ollama'
      ? ollamaUp
        ? 'ollama'
        : 'none'
      : cfg.provider === 'bundled'
        ? ready
          ? 'bundled'
          : 'none'
        : ready
          ? 'bundled'
          : ollamaUp
            ? 'ollama'
            : 'none'
  const needsSetup = !ready && !ollamaUp
  const hasGpu =
    needsSetup || active === 'bundled' ? await llamacpp.detectGpu().catch(() => false) : false
  const models = active === 'ollama' ? await ollamaList(cfg.baseUrl) : []
  return { available: active !== 'none', activeProvider: active, needsSetup, hasGpu, models, config: cfg }
}

let setupRunning = false
export async function setupBundled(onProgress: (p: AiSetupProgress) => void): Promise<void> {
  if (setupRunning) return
  setupRunning = true
  try {
    const hasGpu = await llamacpp.detectGpu().catch(() => false)
    const chat = chatModelForHardware(hasGpu)
    await downloadModel(chat, (received, total) =>
      onProgress({ role: 'chat', label: chat.label, received, total, done: false })
    )
    onProgress({ role: 'chat', label: chat.label, received: chat.sizeBytes, total: chat.sizeBytes, done: true })
    await downloadModel(MODELS.embed, (received, total) =>
      onProgress({ role: 'embed', label: MODELS.embed.label, received, total, done: false })
    )
    onProgress({
      role: 'embed',
      label: MODELS.embed.label,
      received: MODELS.embed.sizeBytes,
      total: MODELS.embed.sizeBytes,
      done: true
    })
  } catch (e) {
    onProgress({
      role: 'chat',
      label: 'model',
      received: 0,
      total: 0,
      done: true,
      error: e instanceof Error ? e.message : String(e)
    })
  } finally {
    setupRunning = false
  }
}
