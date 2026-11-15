import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi, expect, it } from 'vitest'
import { downloadModel, remainingModelBytes, modelPath, modelPresent, type ModelDef } from '../src/main/ai/models'

const location = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => location.path } }))
it('resumes a cancelled model request from disk and verifies its checksum before activation', async () => {
  location.path = mkdtempSync(join(tmpdir(), 'obs-model-test-'))
  const data = Buffer.alloc(256 * 1024, 7)
  const ranges: string[] = []
  const controller = new AbortController()
  const server = createServer((request, res) => {
    if (request.headers.range) {
      ranges.push(request.headers.range)
      const start = Number(request.headers.range.match(/\d+/)?.[0])
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${data.length - 1}/${data.length}` })
      res.end(data.subarray(start))
    } else {
      res.writeHead(200)
      res.write(data.subarray(0, 64 * 1024))
    }
  })
  try {
    await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok))
    const def: ModelDef = { id: 'test', role: 'chat', file: 'small.gguf', sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'), label: 'Test model',
      url: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
    const file = modelPath(def)
    const download = downloadModel(def, () => {}, controller.signal)
    await vi.waitFor(() => expect(existsSync(file + '.part') && statSync(file + '.part').size > 0).toBe(true), { timeout: 5000 })
    controller.abort()
    await expect(download).rejects.toThrow()
    expect(modelPresent(def)).toBe(false)
    const partial = statSync(file + '.part').size
    expect(remainingModelBytes(def)).toBe(data.length - partial)
    await downloadModel(def, () => {})
    expect(ranges).toEqual([`bytes=${partial}-`])
    expect(readFileSync(file)).toEqual(data)
    expect(modelPresent(def)).toBe(true)
    expect(remainingModelBytes(def)).toBe(0)
    expect(existsSync(file + '.part')).toBe(false)
  } finally {
    controller.abort()
    server.closeAllConnections()
    server.close()
    rmSync(location.path, { recursive: true, force: true })
  }
})
