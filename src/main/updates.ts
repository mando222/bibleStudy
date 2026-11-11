import { studyProfile } from './studyProfile'
import { app, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { downloadToFile } from './download'
import { isNewerVersion, parseVersion } from '../shared/semver'
import {
  isReleaseUrl,
  pickReleaseAsset,
  safeAssetFilename,
  type ReleaseAsset
} from '../shared/releaseAssets'
import type { UpdateDownload, UpdateInfo, UpdatePrefs } from '../shared/types'

/**
 * The only network this app ever touches: an unauthenticated GET to the GitHub Releases API to see
 * whether a newer version has been published, and — only if the user presses Download — a fetch of
 * that release's installer.
 *
 * The project is deliberately offline-first (see CLAUDE.md), so this is deliberately narrow:
 *   • nothing is sent — no identifiers, no telemetry, no query parameters;
 *   • it never blocks startup, and a failed launch check (offline, rate-limited, DNS) is silent;
 *   • launch checks reuse a successful response for a day, and can be switched off;
 *   • the app never RUNS an installer. Downloading one is explicit, user-pressed, and writes to the
 *     user's own Downloads folder; installing is left entirely to them.
 *
 * Installation is a separate, user-initiated step. See issue #1 for the distribution history.
 */

const RELEASES_API = 'https://api.github.com/repos/mando222/bibleStudy/releases/latest'
const DAY_MS = 86_400_000
const TIMEOUT_MS = 6000

interface UpdateConfig {
  checkOnLaunch: boolean
  dismissedVersion?: string
  lastCheckedAt?: number
  latestRelease?: Release
}

const DEFAULTS: UpdateConfig = { checkOnLaunch: true }

function configPath(): string {
  return join(studyProfile().root, 'updates.json')
}

function readConfig(): UpdateConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<UpdateConfig>) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeConfig(patch: Partial<UpdateConfig>): UpdateConfig {
  const next = { ...readConfig(), ...patch }
  try {
    writeFileSync(configPath(), JSON.stringify(next, null, 2))
  } catch {
    /* a read-only home directory shouldn't break the app */
  }
  return next
}

interface Release {
  tag_name: string
  body: string
  html_url: string
  assets: ReleaseAsset[]
}

// Keep only the fields we need. A study profile can be restored on another platform, so keep
// the list of assets and select the installer on the machine where the offer will be shown.
function parseRelease(value: unknown): Release | null {
  if (typeof value !== 'object' || value === null) return null
  const release = value as Partial<Release> & { draft?: boolean; prerelease?: boolean }
  const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : ''
  if (release.draft || release.prerelease || parseVersion(tag)?.prerelease.length !== 0) return null
  const assets = Array.isArray(release.assets) ? release.assets : []
  return {
    tag_name: tag,
    body: typeof release.body === 'string' ? release.body.trim().slice(0, 4000) : '',
    html_url: typeof release.html_url === 'string' && isReleaseUrl(release.html_url)
      ? release.html_url
      : `https://github.com/mando222/bibleStudy/releases/tag/${tag}`,
    assets: assets
      .filter((asset) => asset && typeof asset.name === 'string' &&
        typeof asset.browser_download_url === 'string' && isReleaseUrl(asset.browser_download_url))
      .map(({ name, browser_download_url }) => ({ name, browser_download_url }))
  }
}

async function fetchLatestRelease(): Promise<Release> {
  let res: Response
  try {
    res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-bible-study' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    throw new Error('Could not reach GitHub. Check your connection and try again.')
  }
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}. Try again later.`)
  const release = parseRelease(await res.json().catch(() => null))
  if (!release) throw new Error('GitHub did not return a valid stable release. Try again later.')
  writeConfig({ latestRelease: release, lastCheckedAt: Date.now() })
  return release
}

function availableUpdate(release: Release | null, cfg: UpdateConfig, force: boolean): UpdateInfo | null {
  if (!release || (!force && !cfg.checkOnLaunch)) return null
  const tag = release.tag_name
  const current = app.getVersion()
  if (!isNewerVersion(tag, current)) return null
  if (!force && cfg.dismissedVersion && !isNewerVersion(tag, cfg.dismissedVersion)) return null

  const asset = pickReleaseAsset(release.assets, process.platform, process.arch)
  return {
    current,
    latest: tag.replace(/^v/, ''),
    notes: release.body,
    releaseUrl: release.html_url,
    downloadUrl: asset?.browser_download_url ?? release.html_url,
    assetName: asset?.name ?? null
  }
}

let pendingRelease: Promise<Release> | null = null

/** Launch checks can reuse the last known release offline. Manual checks always require a fresh response. */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const cfg = readConfig()
  if (!force && !cfg.checkOnLaunch) return null
  const cached = parseRelease(cfg.latestRelease)
  const age = Date.now() - (cfg.lastCheckedAt ?? 0)
  if (!force && cached && age >= 0 && age < DAY_MS) return availableUpdate(cached, cfg, false)

  pendingRelease ??= fetchLatestRelease().finally(() => {
    pendingRelease = null
  })
  let release: Release | null
  try {
    release = await pendingRelease
  } catch (error) {
    if (force) throw error
    release = cached
  }
  // A dismissal or preference change may have happened while the request was in flight.
  return availableUpdate(release, readConfig(), force)
}

export function registerUpdateIpc(): void {
  ipcMain.handle('updates:check', (_e, force?: boolean) => checkForUpdate(!!force))
  ipcMain.handle('updates:getPrefs', (): UpdatePrefs => ({ checkOnLaunch: readConfig().checkOnLaunch }))
  ipcMain.handle('updates:setPrefs', (_e, patch: Partial<UpdatePrefs>): UpdatePrefs => {
    const next = writeConfig({ checkOnLaunch: patch.checkOnLaunch ?? readConfig().checkOnLaunch })
    return { checkOnLaunch: next.checkOnLaunch }
  })
  ipcMain.handle('updates:dismiss', (_e, version: string) => {
    writeConfig({ dismissedVersion: version })
  })
  // Hand the installer to the browser — the app never runs it itself.
  ipcMain.handle('updates:openDownload', (_e, url: string) => {
    if (isReleaseUrl(url)) void shell.openExternal(url)
  })
  ipcMain.handle('updates:download', (e, url: string, assetName: string) =>
    downloadInstaller(e.sender, url, assetName)
  )
  ipcMain.handle('updates:cancelDownload', () => {
    inFlight?.abort()
  })
  // Only ever the file this process just wrote — never a path chosen by the renderer.
  ipcMain.handle('updates:revealDownload', () => {
    if (lastDownload) shell.showItemInFolder(lastDownload)
  })
}


let inFlight: AbortController | null = null
let lastDownload: string | null = null

/**
 * Fetch a release installer into the user's Downloads folder, reporting progress as it goes.
 *
 * Deliberately just a download. The file is written where a browser would have put it and then
 * shown in the file manager when the user asks.
 */
async function downloadInstaller(
  sender: Electron.WebContents,
  url: string,
  assetName: string
): Promise<UpdateDownload> {
  if (!isReleaseUrl(url)) return { ok: false, error: 'That link isn’t one of our releases.' }
  if (inFlight) return { ok: false, error: 'A download is already running.' }

  const dest = join(app.getPath('downloads'), safeAssetFilename(assetName))
  const controller = new AbortController()
  inFlight = controller
  try {
    const res = await downloadToFile(
      url,
      dest,
      (p) => {
        if (!sender.isDestroyed()) sender.send('updates:progress', p)
      },
      controller.signal
    )
    if (res.ok) lastDownload = res.path
    return res
  } finally {
    inFlight = null
  }
}
