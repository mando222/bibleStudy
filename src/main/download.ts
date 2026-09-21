import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateDownload, UpdateProgress } from '../shared/types'

/**
 * Stream a URL to a file, reporting progress.
 *
 * Deliberately free of any Electron import so it can be exercised directly by the tests — this is
 * the part with real failure modes (a truncated stream, a half-written file left behind, a server
 * that never sends Content-Length).
 *
 * Writes to a sibling `.part` file and renames only on success, so an interrupted download can
 * never be mistaken for a complete installer.
 */
export async function downloadToFile(
  url: string,
  dest: string,
  onProgress: (p: UpdateProgress) => void,
  signal?: AbortSignal
): Promise<UpdateDownload> {
  const part = `${dest}.part`
  try {
    await mkdir(dirname(dest), { recursive: true })
    const res = await fetch(url, { headers: { 'User-Agent': 'open-bible-study' }, signal })
    if (!res.ok || !res.body) return { ok: false, error: `Download failed (HTTP ${res.status}).` }

    // 0 when the server doesn't say; the bar shows an indeterminate state rather than a wrong one.
    const total = Number(res.headers.get('content-length') ?? 0)
    let received = 0
    const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    body.on('data', (chunk: Buffer) => {
      received += chunk.length
      onProgress({ received, total })
    })
    await pipeline(body, createWriteStream(part))

    // A stream that ends early resolves like a complete one, so check the length we were promised.
    if (total && received !== total) {
      await rm(part, { force: true })
      return { ok: false, error: 'Download ended early — please try again.' }
    }
    await rename(part, dest)
    return { ok: true, path: dest }
  } catch {
    await rm(part, { force: true }).catch(() => undefined)
    return signal?.aborted
      ? { ok: false, error: 'Download cancelled.' }
      : { ok: false, error: 'Download failed — check your connection, or use your browser.' }
  }
}
