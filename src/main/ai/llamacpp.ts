import type { ChatMessage } from '../../shared/types'

// node-llama-cpp is ESM-only; load it via a runtime dynamic import that the CJS
// bundler won't rewrite into require().
type NLC = typeof import('node-llama-cpp')
let nlcPromise: Promise<NLC> | null = null
function nlc(): Promise<NLC> {
  if (!nlcPromise) {
    nlcPromise = (new Function('m', 'return import(m)') as (m: string) => Promise<NLC>)(
      'node-llama-cpp'
    )
  }
  return nlcPromise
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let llama: any = null
let chatModel: any = null
let chatPath = ''
let embedModel: any = null
let embedPath = ''
let embedContext: any = null // reused across embed() calls to avoid per-call setup
let gpuCache: boolean | null = null

// A persistent chat session so the KV cache carries between turns — only the new user
// turn is prefilled instead of re-processing the whole conversation every message.
interface ChatState {
  session: any
  context: any
  modelPath: string
  conversationId: string
  system: string
  turns: number // user turns already processed by this session
}
let chat: ChatState | null = null

async function getLlama(): Promise<any> {
  if (!llama) {
    const mod = await nlc()
    llama = await mod.getLlama()
  }
  return llama
}

export async function detectGpu(): Promise<boolean> {
  if (gpuCache !== null) return gpuCache
  try {
    const l = await getLlama()
    gpuCache = Boolean(l.gpu) && l.gpu !== 'false'
  } catch {
    gpuCache = false
  }
  return gpuCache
}

async function loadChat(path: string): Promise<any> {
  if (chatModel && chatPath === path) return chatModel
  if (chatModel) {
    await chatModel.dispose()
    chatModel = null
  }
  const l = await getLlama()
  chatModel = await l.loadModel({ modelPath: path })
  chatPath = path
  return chatModel
}

async function loadEmbed(path: string): Promise<any> {
  if (embedModel && embedPath === path) return embedModel
  if (embedContext) {
    try {
      await embedContext.dispose()
    } catch {
      /* ignore */
    }
    embedContext = null
  }
  const l = await getLlama()
  embedModel = await l.loadModel({ modelPath: path })
  embedPath = path
  return embedModel
}

/** Drop the persistent chat session (e.g. on model switch or "new chat"). */
export async function disposeChat(): Promise<void> {
  if (chat) {
    try {
      await chat.context.dispose()
    } catch {
      /* ignore */
    }
    chat = null
  }
}

async function createContext(model: any): Promise<any> {
  // Size the context from the model, capped so CPU-only machines stay responsive.
  const trainCtx = Number(model.trainContextSize) || 8192
  const contextSize = Math.min(trainCtx, 8192)
  try {
    return await model.createContext({ contextSize, flashAttention: true })
  } catch {
    // Some backends/models don't support flash attention — fall back cleanly.
    return await model.createContext({ contextSize })
  }
}

/**
 * Stream one conversation turn. Reuses a persistent session keyed by conversationId so the
 * KV cache is preserved between turns; rebuilds (replaying prior turns) after a restart,
 * model switch, or divergence. `userPrompt` is this turn's text (RAG context + question);
 * `system` is the fixed system prompt; `priorTurns` are earlier user/assistant messages.
 */
export async function* chatTurn(opts: {
  modelFile: string
  conversationId: string
  system: string
  priorTurns: ChatMessage[]
  userPrompt: string
  signal?: AbortSignal
}): AsyncGenerator<string> {
  const { LlamaChatSession } = await nlc()
  const priorUserTurns = opts.priorTurns.filter((m) => m.role === 'user').length
  const warm =
    chat &&
    chat.conversationId === opts.conversationId &&
    chat.modelPath === opts.modelFile &&
    chat.system === opts.system &&
    chat.turns === priorUserTurns

  if (!warm) {
    await disposeChat()
    const model = await loadChat(opts.modelFile)
    const context = await createContext(model)
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: opts.system
    })
    if (opts.priorTurns.length) {
      const history: any[] = [{ type: 'system', text: opts.system }]
      for (const m of opts.priorTurns) {
        history.push(
          m.role === 'user'
            ? { type: 'user', text: m.content }
            : { type: 'model', response: [m.content] }
        )
      }
      session.setChatHistory(history)
    }
    chat = {
      session,
      context,
      modelPath: opts.modelFile,
      conversationId: opts.conversationId,
      system: opts.system,
      turns: priorUserTurns
    }
  }

  const session = chat!.session

  // Bridge the onTextChunk callback into this async generator, surfacing errors instead of
  // hanging forever if generation rejects mid-stream.
  const queue: string[] = []
  let notify: (() => void) | null = null
  let finished = false
  let error: unknown = null
  const wake = (): void => {
    if (notify) {
      const n = notify
      notify = null
      n()
    }
  }
  const done = session
    .prompt(opts.userPrompt, {
      // Low temperature keeps grounded study answers faithful to the retrieved context.
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 2048,
      signal: opts.signal,
      onTextChunk(chunk: string) {
        queue.push(chunk)
        wake()
      }
    })
    .then(
      () => {
        finished = true
        wake()
      },
      (e: unknown) => {
        error = e
        finished = true
        wake()
      }
    )

  try {
    while (!finished || queue.length) {
      if (queue.length) yield queue.shift() as string
      else await new Promise<void>((r) => (notify = r))
    }
    await done
    if (error) throw error
    chat!.turns = priorUserTurns + 1
  } catch (e) {
    // The KV state may be inconsistent after an abort/error — drop the session so the next
    // turn rebuilds from history cleanly.
    await disposeChat()
    throw e
  }
}

export async function embed(modelFile: string, texts: string[]): Promise<number[][]> {
  const model = await loadEmbed(modelFile)
  if (!embedContext) embedContext = await model.createEmbeddingContext()
  const out: number[][] = []
  for (const t of texts) {
    const e = await embedContext.getEmbeddingFor(t)
    out.push(Array.from(e.vector as Iterable<number>))
  }
  return out
}
/* eslint-enable @typescript-eslint/no-explicit-any */
