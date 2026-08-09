import { DatabaseSync } from 'node:sqlite'
import * as sqliteVec from 'sqlite-vec'
import { app } from 'electron'
import { join } from 'node:path'
import type { AiDoc } from '../../shared/types'

// A separate ai.sqlite (userData) holds the RAG document store + vector index.
let db: DatabaseSync | null = null

export function aiDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(join(app.getPath('userData'), 'ai.sqlite'), { allowExtension: true })
  db.loadExtension(sqliteVec.getLoadablePath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      chunks INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks (doc_id);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `)
  return db
}

function ensureVecTable(dim: number): void {
  const d = aiDb()
  const cur = d.prepare("SELECT value FROM meta WHERE key='dim'").get() as { value: string } | undefined
  if (!cur) {
    d.prepare("INSERT INTO meta (key, value) VALUES ('dim', ?)").run(String(dim))
  } else if (Number(cur.value) !== dim) {
    throw new Error(`Embedding dimension changed (${cur.value} → ${dim}). Remove and re-import documents.`)
  }
  d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec USING vec0(embedding float[${dim}])`)
}

export function upsertDocument(id: string, name: string): void {
  aiDb()
    .prepare('INSERT OR REPLACE INTO documents (id, name, active, chunks, added_at) VALUES (?,?,1,0,?)')
    .run(id, name, Date.now())
}

export function addChunks(docId: string, items: { text: string; embedding: number[] }[]): void {
  if (!items.length) return
  ensureVecTable(items[0].embedding.length)
  const d = aiDb()
  const insChunk = d.prepare('INSERT INTO chunks (doc_id, ordinal, text) VALUES (?,?,?)')
  const insVec = d.prepare('INSERT INTO chunk_vec (rowid, embedding) VALUES (?, ?)')
  d.exec('BEGIN')
  items.forEach((c, i) => {
    const info = insChunk.run(docId, i, c.text)
    insVec.run(BigInt(info.lastInsertRowid), JSON.stringify(c.embedding))
  })
  d.prepare('UPDATE documents SET chunks = ? WHERE id = ?').run(items.length, docId)
  d.exec('COMMIT')
}

/** KNN over ACTIVE documents' chunks. */
export function searchChunks(queryEmbedding: number[], k = 5): { text: string; source: string }[] {
  const d = aiDb()
  const hasVec = d.prepare("SELECT name FROM sqlite_master WHERE name='chunk_vec'").get()
  if (!hasVec) return []
  const near = d
    .prepare('SELECT rowid, distance FROM chunk_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?')
    .all(JSON.stringify(queryEmbedding), k * 5) as { rowid: number; distance: number }[]
  const getChunk = d.prepare(
    'SELECT c.text AS text, dd.name AS name, dd.active AS active FROM chunks c JOIN documents dd ON dd.id = c.doc_id WHERE c.id = ?'
  )
  const out: { text: string; source: string }[] = []
  for (const n of near) {
    const c = getChunk.get(n.rowid) as { text: string; name: string; active: number } | undefined
    if (c && c.active) {
      out.push({ text: c.text, source: c.name })
      if (out.length >= k) break
    }
  }
  return out
}

export function listDocuments(): AiDoc[] {
  const rows = aiDb()
    .prepare('SELECT id, name, chunks, active, added_at FROM documents ORDER BY added_at DESC')
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    chunks: r.chunks as number,
    active: !!r.active,
    addedAt: r.added_at as number
  }))
}

export function setDocumentActive(id: string, active: boolean): void {
  aiDb().prepare('UPDATE documents SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
}

export function deleteDocument(id: string): void {
  const d = aiDb()
  const ids = (d.prepare('SELECT id FROM chunks WHERE doc_id = ?').all(id) as { id: number }[]).map(
    (r) => r.id
  )
  d.exec('BEGIN')
  const hasVec = d.prepare("SELECT name FROM sqlite_master WHERE name='chunk_vec'").get()
  if (hasVec) {
    const delVec = d.prepare('DELETE FROM chunk_vec WHERE rowid = ?')
    for (const cid of ids) delVec.run(BigInt(cid))
  }
  d.prepare('DELETE FROM chunks WHERE doc_id = ?').run(id)
  d.prepare('DELETE FROM documents WHERE id = ?').run(id)
  d.exec('COMMIT')
}
