import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { embed } from './ollama'
import { getConfig } from './config'
import { addChunks, upsertDocument } from './vectors'
import type { AiDoc } from '../../shared/types'

async function extractText(path: string): Promise<string> {
  const ext = extname(path).toLowerCase()
  if (ext === '.pdf') {
    const mod = (await import('pdf-parse')) as unknown as { default: (b: Buffer) => Promise<{ text: string }> }
    const data = await mod.default(readFileSync(path))
    return data.text
  }
  // .txt / .md / .markdown / .csv / other plain text
  return readFileSync(path, 'utf8')
}

/** Chunk text into ~900-char passages on paragraph boundaries, with light overlap. */
function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const paras = clean.split(/\n\n+/)
  const chunks: string[] = []
  let cur = ''
  for (const p of paras) {
    if (cur && (cur + '\n\n' + p).length > size) {
      chunks.push(cur.trim())
      cur = cur.slice(-overlap) + '\n\n' + p
    } else {
      cur = cur ? cur + '\n\n' + p : p
    }
  }
  if (cur.trim()) chunks.push(cur.trim())

  const out: string[] = []
  for (const c of chunks) {
    if (c.length <= size * 1.6) out.push(c)
    else for (let i = 0; i < c.length; i += size) out.push(c.slice(i, i + size))
  }
  return out.filter((c) => c.trim().length > 0)
}

export async function importDocument(path: string): Promise<AiDoc> {
  const text = await extractText(path)
  const chunks = chunkText(text)
  if (!chunks.length) throw new Error('No readable text found in that file.')

  const cfg = getConfig()
  const embeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16)
    const vecs = await embed(cfg.baseUrl, cfg.embedModel, batch)
    if (vecs.length !== batch.length) throw new Error('Embedding failed — is the embed model installed?')
    embeddings.push(...vecs)
  }

  const id = `doc_${Date.now()}`
  const name = basename(path)
  upsertDocument(id, name)
  addChunks(
    id,
    chunks.map((t, i) => ({ text: t, embedding: embeddings[i] }))
  )
  return { id, name, chunks: chunks.length, active: true, addedAt: Date.now() }
}

/** Semantic retrieval over active documents for the assistant. */
export async function retrieveDocs(
  query: string,
  k = 5
): Promise<{ text: string; source: string }[]> {
  const cfg = getConfig()
  try {
    const [qvec] = await embed(cfg.baseUrl, cfg.embedModel, [query])
    if (!qvec) return []
    const { searchChunks } = await import('./vectors')
    return searchChunks(qvec, k)
  } catch {
    return []
  }
}
