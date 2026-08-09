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
let gpuCache: boolean | null = null

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
  const l = await getLlama()
  embedModel = await l.loadModel({ modelPath: path })
  embedPath = path
  return embedModel
}

export async function* chatStream(modelFile: string, messages: ChatMessage[]): AsyncGenerator<string> {
  const { LlamaChatSession } = await nlc()
  const model = await loadChat(modelFile)
  const context = await model.createContext({ contextSize: 4096 })
  try {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: system
    })
    const convo = messages.filter((m) => m.role !== 'system')
    const last = convo[convo.length - 1]
    const prior = convo.slice(0, -1)
    if (prior.length) {
      const history: any[] = [{ type: 'system', text: system }]
      for (const m of prior) {
        history.push(
          m.role === 'user' ? { type: 'user', text: m.content } : { type: 'model', response: [m.content] }
        )
      }
      session.setChatHistory(history)
    }

    // Bridge the onTextChunk callback into this async generator.
    const queue: string[] = []
    let notify: (() => void) | null = null
    let finished = false
    const done = session
      .prompt(last?.content ?? '', {
        onTextChunk(chunk: string) {
          queue.push(chunk)
          if (notify) {
            notify()
            notify = null
          }
        }
      })
      .then(() => {
        finished = true
        if (notify) {
          notify()
          notify = null
        }
      })

    while (!finished || queue.length) {
      if (queue.length) yield queue.shift() as string
      else await new Promise<void>((r) => (notify = r))
    }
    await done
  } finally {
    await context.dispose()
  }
}

export async function embed(modelFile: string, texts: string[]): Promise<number[][]> {
  const model = await loadEmbed(modelFile)
  const context = await model.createEmbeddingContext()
  try {
    const out: number[][] = []
    for (const t of texts) {
      const e = await context.getEmbeddingFor(t)
      out.push(Array.from(e.vector as Iterable<number>))
    }
    return out
  } finally {
    await context.dispose()
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
