import {
  ping as ollamaPing,
  listModels as ollamaList,
  chatStream as ollamaChat,
  embed as ollamaEmbed
} from './ollama'
import * as llamacpp from './llamacpp'
import {
  MODELS,
  modelForTier,
  resolveTier,
  presentChatModel,
  modelPath,
  modelPresent,
  downloadModel,
  type ChatTier
} from './models'
import { getConfig, ensureChatModel } from './config'
import type { AiSetupProgress, AiStatus, ChatMessage } from '../../shared/types'

export type Active = 'bundled' | 'ollama' | 'none'

function bundledReady(): boolean {
  return presentChatModel() !== null
}
/** The chat model to actually run: the configured tier if downloaded, else the largest present. */
async function bundledChatModel(): Promise<ReturnType<typeof modelForTier> | null> {
  const cfg = getConfig()
  const hasGpu = await llamacpp.detectGpu().catch(() => false)
  const target = modelForTier(resolveTier(cfg.chatTier ?? 'auto', hasGpu))
  return modelPresent(target) ? target : presentChatModel()
}
function installedTiers(): ChatTier[] {
  const out: ChatTier[] = []
  if (modelPresent(MODELS.chatFast)) out.push('fast')
  if (modelPresent(MODELS.chatBalanced)) out.push('balanced')
  if (modelPresent(MODELS.chatQuality)) out.push('quality')
  return out
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

/** Stream one conversation turn. Bundled keeps a KV-cached session; Ollama is stateless HTTP. */
export async function* chatTurn(opts: {
  conversationId: string
  system: string
  priorTurns: ChatMessage[]
  userPrompt: string
  signal?: AbortSignal
}): AsyncGenerator<string> {
  const active = await activeProvider()
  if (active === 'bundled') {
    const m = await bundledChatModel()
    if (!m) throw new Error('The assistant isn’t set up yet.')
    yield* llamacpp.chatTurn({ modelFile: modelPath(m), ...opts })
    return
  }
  if (active === 'ollama') {
    const cfg = await ensureChatModel()
    const messages: ChatMessage[] = [
      { role: 'system', content: opts.system },
      ...opts.priorTurns,
      { role: 'user', content: opts.userPrompt }
    ]
    yield* ollamaChat(cfg.baseUrl, cfg.chatModel, messages, opts.signal)
    return
  }
  throw new Error('The assistant isn’t set up yet.')
}

/** Drop the bundled KV-cached session (on model/tier switch or a fresh conversation). */
export async function disposeChat(): Promise<void> {
  await llamacpp.disposeChat()
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
  const chatModelLabel = active === 'bundled' ? ((await bundledChatModel())?.label ?? '') : ''
  return {
    available: active !== 'none',
    activeProvider: active,
    needsSetup,
    hasGpu,
    models,
    config: cfg,
    chatModelLabel,
    installedTiers: installedTiers()
  }
}

let setupRunning = false
export async function setupBundled(onProgress: (p: AiSetupProgress) => void): Promise<void> {
  if (setupRunning) return
  setupRunning = true
  try {
    const cfg = getConfig()
    const hasGpu = await llamacpp.detectGpu().catch(() => false)
    const chat = modelForTier(resolveTier(cfg.chatTier ?? 'auto', hasGpu))
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
