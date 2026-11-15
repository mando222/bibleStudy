import { App } from '@capacitor/app'
import { registerPlugin } from '@capacitor/core'
import { latestAndroidRelease, type AndroidUpdate, type Release } from './androidRelease'

export { latestAndroidRelease, type AndroidUpdate } from './androidRelease'
export type DownloadState = {
  phase: 'idle' | 'downloading' | 'ready' | 'failed'
  version?: string
  url?: string
  received?: number
  total?: number
  message?: string
  canInstall: boolean
}
export const apkUpdater = registerPlugin<{
  getStatus(): Promise<DownloadState>
  download(release: AndroidUpdate): Promise<DownloadState>
  install(): Promise<{ action: 'permission' | 'installer' }>
}>('AndroidUpdater')

let request: Promise<AndroidUpdate | null> | undefined

export function autoChecksEnabled() {
  return localStorage.getItem('android.checkOnLaunch') === 'true'
}
export function setAutoChecks(enabled: boolean) {
  localStorage.setItem('android.checkOnLaunch', String(enabled))
}

export function cachedUpdate(installed: string, maxAge = Infinity): { release: AndroidUpdate | null } | undefined {
  try {
    const cache = JSON.parse(localStorage.getItem('android.updateCache') || 'null')
    const age = Date.now() - cache?.time
    if (cache?.installed === installed && age >= 0 && age < maxAge && Array.isArray(cache.releases)) {
      return { release: latestAndroidRelease(cache.releases, installed) }
    }
  } catch {
    /* Check again if the cached response is unreadable. */
  }
}

export async function checkAndroidUpdates(force: boolean): Promise<AndroidUpdate | null> {
  if (!force && !autoChecksEnabled()) return null
  const info = await App.getInfo()
  if (request) return request
  if (!force) {
    const cached = cachedUpdate(info.version, 86_400_000)
    if (cached) return cached.release
  }
  request = (async () => {
    const response = await fetch('https://api.github.com/repos/mando222/bibleStudy/releases?per_page=100', {
      signal: AbortSignal.timeout(8000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
    if (!response.ok) throw new Error('GitHub returned HTTP ' + response.status + '.')
    const records: Release[] = await response.json()
    const releases = records
      .map(({ tag_name, draft, prerelease, assets }) => ({
        tag_name,
        draft,
        prerelease,
        assets: (assets ?? [])
          .filter((asset) => asset.name?.endsWith('.apk'))
          .map(({ name, browser_download_url }) => ({ name, browser_download_url }))
      }))
      .filter((release) => release.assets.length)
    try {
      localStorage.setItem('android.updateCache', JSON.stringify({ installed: info.version, time: Date.now(), releases }))
    } catch {
      /* The caller can still use this result when web storage is full. */
    }
    return latestAndroidRelease(releases, info.version)
  })().finally(() => {
    request = undefined
  })
  return request
}
