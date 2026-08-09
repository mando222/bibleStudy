import { app } from 'electron'
import { join } from 'node:path'
import {
  mkdirSync,
  existsSync,
  statSync,
  createWriteStream,
  createReadStream,
  renameSync,
  rmSync
} from 'node:fs'
import { createHash } from 'node:crypto'

export interface ModelDef {
  id: string
  role: 'chat' | 'embed'
  file: string
  url: string
  sizeBytes: number
  sha256: string // git-LFS oid; verified after download before the atomic rename
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
    sizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    label: 'Llama 3.2 1B Instruct'
  },
  chatBalanced: {
    id: 'chatBalanced',
    role: 'chat',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_019_377_696,
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    label: 'Llama 3.2 3B Instruct'
  },
  chatQuality: {
    id: 'chatQuality',
    role: 'chat',
    file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sizeBytes: 4_683_074_240,
    sha256: '65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423',
    label: 'Qwen2.5 7B Instruct'
  },
  embed: {
    id: 'embed',
    role: 'embed',
    file: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    sizeBytes: 84_106_624,
    sha256: 'd4e388894e09cf3816e8b0896d81d265b55e7a9fff9ab03fe8bf4ef5e11295ac',
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Stream-hash a file so a completed download can be verified against its known sha256. */
function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** Download one transfer attempt into `tmp`, resuming from `startAt` bytes when the server allows it. */
async function downloadOnce(
  def: ModelDef,
  tmp: string,
  startAt: number,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  const headers: Record<string, string> = {}
  if (startAt > 0) headers.Range = `bytes=${startAt}-`
  const res = await fetch(def.url, { headers })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${def.label}`)
  // If we asked to resume but the server ignored the Range (200, not 206), start the file over.
  const resuming = startAt > 0 && res.status === 206
  const ws = createWriteStream(tmp, { flags: resuming ? 'a' : 'w' })
  let got = resuming ? startAt : 0
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!ws.write(Buffer.from(value))) await new Promise<void>((r) => ws.once('drain', () => r()))
      got += value.length
      onProgress(got, def.sizeBytes)
    }
  } finally {
    ws.end()
  }
  await new Promise<void>((resolve, reject) => {
    ws.on('close', () => resolve())
    ws.on('error', reject)
  })
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

  // Retry transient network failures, resuming from whatever was already written.
  const MAX_ATTEMPTS = 4
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const startAt = existsSync(tmp) ? statSync(tmp).size : 0
      await downloadOnce(def, tmp, startAt, onProgress)
      lastErr = null
      break
    } catch (e) {
      lastErr = e
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1000 * 2 ** attempt) // 1s, 2s, 4s
    }
  }
  if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))

  // Verify integrity before promoting the .part to the real file.
  if (def.sha256) {
    const got = await sha256File(tmp)
    if (got !== def.sha256) {
      rmSync(tmp, { force: true })
      throw new Error(`Downloaded ${def.label} failed its checksum — please try again.`)
    }
  }
  renameSync(tmp, dest)
}
