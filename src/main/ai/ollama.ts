import type { ChatMessage } from '../../shared/types'

/** Minimal Ollama HTTP client (no SDK). Streaming chat + embeddings. */

export async function ping(baseUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return []
    const d = (await r.json()) as { models?: { name: string }[] }
    return (d.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

/** Stream a chat completion, yielding content tokens as they arrive (NDJSON). */
export async function* chatStream(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.2 } }),
    signal
  })
  if (!res.ok || !res.body) throw new Error(`Ollama chat failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        const j = JSON.parse(line) as { message?: { content?: string }; error?: string }
        if (j.error) throw new Error(j.error)
        if (j.message?.content) yield j.message.content
      } catch {
        /* skip malformed line */
      }
    }
  }
}

/** Embed one or more texts. Returns one vector per input. */
export async function embed(baseUrl: string, model: string, input: string[]): Promise<number[][]> {
  const res = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input })
  })
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
  const d = (await res.json()) as { embeddings?: number[][] }
  return d.embeddings ?? []
}
