import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadToFile } from '../src/main/download'
import type { UpdateProgress } from '../src/shared/types'

// Exercises the real streaming path — the part with actual failure modes — against a local
// server, so none of it depends on reaching GitHub.
const BODY = Buffer.alloc(512 * 1024, 7)

let server: Server
let base = ''
let dir = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-length': String(BODY.length) })
      res.end(BODY)
    } else if (req.url === '/no-length') {
      res.writeHead(200)
      res.end(BODY)
    } else if (req.url === '/truncated') {
      // Promises the full length, sends a sliver, then drops the connection.
      res.writeHead(200, { 'content-length': String(BODY.length) })
      res.write(BODY.subarray(0, 1024), () => res.socket?.destroy())
    } else if (req.url === '/slow') {
      res.writeHead(200, { 'content-length': String(BODY.length) })
      res.write(BODY.subarray(0, 1024))
      // never finishes, so the abort path can be tested
    } else {
      res.writeHead(404)
      res.end('nope')
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  dir = await mkdtemp(join(tmpdir(), 'obs-dl-'))
})

afterAll(async () => {
  server.close()
  await rm(dir, { recursive: true, force: true })
})

const gone = async (p: string): Promise<boolean> => !(await access(p).then(() => true, () => false))

describe('update download', () => {
  it('writes the file and reports progress that reaches 100%', async () => {
    const seen: UpdateProgress[] = []
    const dest = join(dir, 'ok.bin')
    const res = await downloadToFile(`${base}/ok`, dest, (p) => seen.push(p))
    expect(res).toEqual({ ok: true, path: dest })
    expect((await readFile(dest)).equals(BODY)).toBe(true)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toEqual({ received: BODY.length, total: BODY.length })
    expect(await gone(`${dest}.part`)).toBe(true) // nothing half-written left behind
  })

  it('still completes when the server sends no Content-Length', async () => {
    const seen: UpdateProgress[] = []
    const dest = join(dir, 'nolen.bin')
    const res = await downloadToFile(`${base}/no-length`, dest, (p) => seen.push(p))
    expect(res.ok).toBe(true)
    expect(seen.at(-1)?.total).toBe(0) // indeterminate, rather than a wrong percentage
    expect((await readFile(dest)).equals(BODY)).toBe(true)
  })

  it('refuses a truncated download instead of leaving a broken installer', async () => {
    const dest = join(dir, 'cut.bin')
    const res = await downloadToFile(`${base}/truncated`, dest, () => undefined)
    // However it surfaces — a thrown stream or a short read — it must not look like success, and
    // must not leave a partial file that could be mistaken for an installer.
    expect(res.ok).toBe(false)
    expect(await gone(dest)).toBe(true)
    expect(await gone(`${dest}.part`)).toBe(true)
  })

  it('reports a failed request without writing anything', async () => {
    const dest = join(dir, 'missing.bin')
    const res = await downloadToFile(`${base}/404`, dest, () => undefined)
    expect(res.ok).toBe(false)
    expect(await gone(dest)).toBe(true)
  })

  it('cancels cleanly, leaving no partial file', async () => {
    const dest = join(dir, 'slow.bin')
    const ac = new AbortController()
    const p = downloadToFile(`${base}/slow`, dest, () => ac.abort(), ac.signal)
    expect(await p).toEqual({ ok: false, error: 'Download cancelled.' })
    expect(await gone(dest)).toBe(true)
    expect(await gone(`${dest}.part`)).toBe(true)
  })
})
