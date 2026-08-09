import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync, existsSync, statSync, createWriteStream, renameSync } from 'node:fs'

export interface ModelDef {
  id: string
  role: 'chat' | 'embed'
  file: string
  url: string
  sizeBytes: number
  label: string
}

// Offline Q4_K_M GGUFs, three quality tiers. Fast (1B) is CPU-quick; Balanced (3B) is a good
// CPU default; Quality (Qwen2.5-7B) gives the most faithful, least-hallucinatory answers and
// shines on a GPU.
export const MODELS = {
  chatFast: {
    id: 'chatFast',
    role: 'chat',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 807_694_016,
    label: 'Llama 3.2 1B Instruct'
  },
  chatBalanced: {
    id: 'chatBalanced',
    role: 'chat',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_019_377_696,
    label: 'Llama 3.2 3B Instruct'
  },
  chatQuality: {
    id: 'chatQuality',
    role: 'chat',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sizeBytes: 4_683_074_240,
    label: 'Qwen2.5 7B Instruct'
  },
  embed: {
    id: 'embed',
    role: 'embed',
    file: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    sizeBytes: 84_106_624,
    label: 'Nomic Embed Text v1.5'
  }
} satisfies Record<string, ModelDef>

export type ChatTier = 'fast' | 'balanced' | 'quality'

export function modelForTier(tier: ChatTier): ModelDef {
  return tier === 'quality' ? MODELS.chatQuality : tier === 'balanced' ? MODELS.chatBalanced : MODELS.chatFast
}

/** Resolve 'auto' from hardware: Quality (7B) on a GPU, Balanced (3B) on CPU-only. */
export function resolveTier(tier: 'auto' | ChatTier, hasGpu: boolean): ChatTier {
  if (tier !== 'auto') return tier
  return hasGpu ? 'quality' : 'balanced'
}

/** The largest downloaded chat model (quality → balanced → fast), or null if none present. */
export function presentChatModel(): ModelDef | null {
  for (const m of [MODELS.chatQuality, MODELS.chatBalanced, MODELS.chatFast]) if (modelPresent(m)) return m
  return null
}

export function modelsDir(): string {
  const d = join(app.getPath('userData'), 'models')
  mkdirSync(d, { recursive: true })
  return d
}
export function modelPath(def: ModelDef): string {
  return join(modelsDir(), def.file)
}
export function modelPresent(def: ModelDef): boolean {
  const p = modelPath(def)
  return existsSync(p) && statSync(p).size > def.sizeBytes * 0.5
}

export async function downloadModel(
  def: ModelDef,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  if (modelPresent(def)) {
    onProgress(def.sizeBytes, def.sizeBytes)
    return
  }
  const dest = modelPath(def)
  const tmp = `${dest}.part`
  const res = await fetch(def.url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${def.label}`)
  const total = Number(res.headers.get('content-length')) || def.sizeBytes
  const ws = createWriteStream(tmp)
  const reader = res.body.getReader()
  let got = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!ws.write(Buffer.from(value))) await new Promise<void>((r) => ws.once('drain', () => r()))
      got += value.length
      onProgress(got, total)
    }
  } finally {
    ws.end()
  }
  await new Promise<void>((resolve, reject) => {
    ws.on('close', () => resolve())
    ws.on('error', reject)
  })
  renameSync(tmp, dest)
}
