import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import type { AiConfig } from '../../shared/types'
import { listModels } from './ollama'

const DEFAULTS: AiConfig = {
  baseUrl: 'http://localhost:11434',
  chatModel: '',
  embedModel: 'nomic-embed-text',
  provider: 'auto',
  chatTier: 'auto'
}

function configPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

let cache: AiConfig | null = null

export function getConfig(): AiConfig {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<AiConfig>) }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function setConfig(patch: Partial<AiConfig>): AiConfig {
  cache = { ...getConfig(), ...patch }
  try {
    writeFileSync(configPath(), JSON.stringify(cache, null, 2))
  } catch {
    /* ignore */
  }
  return cache
}

/** Choose a sensible chat model from installed ones if the user hasn't picked one. */
export async function ensureChatModel(): Promise<AiConfig> {
  const c = getConfig()
  if (c.chatModel) return c
  const models = await listModels(c.baseUrl)
  const prefer = ['llama3.1:latest', 'llama3.1', 'qwen3', 'gemma4-fast', 'gemma', 'mistral', 'llama']
  const pick = models.find((m) => prefer.some((p) => m.startsWith(p))) ?? models[0] ?? ''
  return pick ? setConfig({ chatModel: pick }) : c
}
