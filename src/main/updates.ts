import { app, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { downloadToFile } from './download'
import { isNewerVersion } from '../shared/semver'
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
 *   • it never blocks startup, and any failure (offline, rate-limited, DNS) is silent;
 *   • it runs at most once a day, and not at all when the user turns it off;
 *   • the app never RUNS an installer. Downloading one is explicit, user-pressed, and writes to the
 *     user's own Downloads folder; installing is left entirely to them.
 *
 * Silent download-and-install (electron-updater) is intentionally NOT used: macOS builds are
 * unsigned (`identity: null` in electron-builder.yml) and Squirrel.Mac requires a signed,
 * notarized app, so it could never work there. See issue #1. Fetching the installer in-app is the
 * part of that we CAN do — on macOS a running app cannot replace its own bundle, so the download
 * has to be able to finish while the app is still open and be installed whenever the user quits.
 */

const RELEASES_API = 'https://api.github.com/repos/mando222/bibleStudy/releases/latest'
const DAY_MS = 86_400_000
const TIMEOUT_MS = 6000

interface UpdateConfig {
  checkOnLaunch: boolean
  dismissedVersion?: string
  lastCheckedAt?: number
}

const DEFAULTS: UpdateConfig = { checkOnLaunch: true }

function configPath(): string {
  return join(app.getPath('userData'), 'updates.json')
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

interface GhRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: ReleaseAsset[]
}

/**
 * Look for a newer release. Returns null whenever there's nothing to show — disabled, throttled,
 * already dismissed, offline, or simply up to date — so callers never have to handle errors.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const cfg = readConfig()
  if (!force && !cfg.checkOnLaunch) return null
  if (!force && Date.now() - (cfg.lastCheckedAt ?? 0) < DAY_MS) return null

  let release: GhRelease
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-bible-study' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    release = (await res.json()) as GhRelease
  } catch {
    return null // offline, blocked, rate-limited — never surfaced to the user
  }
  writeConfig({ lastCheckedAt: Date.now() })

  const tag = release.tag_name ?? ''
  if (!tag || release.draft || release.prerelease) return null

  const current = app.getVersion()
  if (!isNewerVersion(tag, current)) return null
  if (!force && cfg.dismissedVersion && !isNewerVersion(tag, cfg.dismissedVersion)) return null

  const asset = pickReleaseAsset(release.assets ?? [], process.platform, process.arch)
  const releaseUrl = release.html_url ?? `https://github.com/mando222/bibleStudy/releases/tag/${tag}`
  return {
    current,
    latest: tag.replace(/^v/, ''),
    notes: (release.body ?? '').trim().slice(0, 4000),
    releaseUrl,
    downloadUrl: asset?.browser_download_url ?? releaseUrl,
    assetName: asset?.name ?? null
  }
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
 * shown in the file manager; nothing is mounted, unpacked or executed, and the running app is
 * never touched — on macOS it cannot be, since an app can't replace its own bundle while open.
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
