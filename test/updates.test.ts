import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkForUpdate } from '../src/main/updates'

const installation = vi.hoisted(() => ({ root: '', version: '0.4.0' }))
vi.mock('electron', () => ({ app: { getVersion: () => installation.version } }))
vi.mock('../src/main/studyProfile', () => ({ studyProfile: () => ({ root: installation.root }) }))

const request = vi.fn<typeof fetch>()
let preferences: string

function reply(tag = 'v0.4.1'): void {
  request.mockResolvedValueOnce(Response.json({ tag_name: tag, body: 'A new release', assets: [] }))
}

function setPreferences(patch: Record<string, unknown>): void {
  const config = JSON.parse(readFileSync(preferences, 'utf8'))
  writeFileSync(preferences, JSON.stringify({ ...config, ...patch }))
}

beforeEach(() => {
  installation.root = mkdtempSync(join(tmpdir(), 'obs-updates-'))
  installation.version = '0.4.0'
  preferences = join(installation.root, 'updates.json')
  writeFileSync(preferences, '{}')
  request.mockReset()
  vi.stubGlobal('fetch', request)
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(installation.root, { recursive: true, force: true })
})

describe('launch and manual update checks', () => {
  it('revalidates a legacy last-check timestamp once and replays the offer across launches', async () => {
    setPreferences({ lastCheckedAt: Date.now() })
    reply()
    const offer = await checkForUpdate()
    expect(offer).toMatchObject({ current: '0.4.0', latest: '0.4.1', notes: 'A new release' })
    expect(await checkForUpdate()).toEqual(offer)
    installation.version = '0.4.1'
    expect(await checkForUpdate()).toBeNull()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('honors dismissal and disabled launch checks while allowing fresh manual checks', async () => {
    reply()
    await checkForUpdate()
    setPreferences({ dismissedVersion: '0.4.1' })
    expect(await checkForUpdate()).toBeNull()
    setPreferences({ lastCheckedAt: 0, checkOnLaunch: false })
    expect(await checkForUpdate()).toBeNull()
    expect(request).toHaveBeenCalledTimes(1)
    reply()
    expect((await checkForUpdate(true))?.latest).toBe('0.4.1')
    setPreferences({ lastCheckedAt: 0, checkOnLaunch: true })
    reply('v0.4.2')
    expect((await checkForUpdate())?.latest).toBe('0.4.2')
  })

  it('retains an expired offer offline, reports a manual connection failure, and retries on launch', async () => {
    reply()
    const available = await checkForUpdate()
    setPreferences({ lastCheckedAt: 0 })
    request.mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline'))
    expect(await checkForUpdate()).toEqual(available)
    await expect(checkForUpdate(true)).rejects.toThrow('Could not reach GitHub')
    reply('v0.4.0')
    expect(await checkForUpdate()).toBeNull()
    expect(await checkForUpdate()).toBeNull()
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('does not report an HTTP failure or invalid response as being up to date', async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 403 }))
    await expect(checkForUpdate(true)).rejects.toThrow('HTTP 403')
    request.mockResolvedValueOnce(new Response('invalid JSON'))
    await expect(checkForUpdate(true)).rejects.toThrow('valid stable release')
    reply('v0.5.0-beta.1')
    await expect(checkForUpdate(true)).rejects.toThrow('valid stable release')
    reply('v0.4.0')
    expect(await checkForUpdate(true)).toBeNull()
    expect(await checkForUpdate()).toBeNull()
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('shares a pending request and respects a dismissal made before the launch check completes', async () => {
    let respond!: (response: Response) => void
    request.mockReturnValueOnce(new Promise<Response>(resolve => { respond = resolve }))
    const launch = checkForUpdate()
    const manual = checkForUpdate(true)
    setPreferences({ dismissedVersion: '0.4.1' })
    respond(Response.json({ tag_name: 'v0.4.1' }))
    expect(await launch).toBeNull()
    expect((await manual)?.latest).toBe('0.4.1')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
