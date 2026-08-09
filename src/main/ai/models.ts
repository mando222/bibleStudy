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

// Small, offline, Q4_K_M GGUFs. 1B is CPU-friendly; 3B is used when a GPU is present.
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
  embed: {
    id: 'embed',
    role: 'embed',
    file: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    sizeBytes: 84_106_624,
    label: 'Nomic Embed Text v1.5'
  }
} satisfies Record<string, ModelDef>

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

/** Fast 1B on CPU-only, 3B when a GPU is present. */
export function chatModelForHardware(hasGpu: boolean): ModelDef {
  return hasGpu ? MODELS.chatBalanced : MODELS.chatFast
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
