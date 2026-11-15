import { useCallback, useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { isNewerVersion } from '@shared/semver'
import {
  apkUpdater, autoChecksEnabled, cachedUpdate, checkAndroidUpdates, setAutoChecks,
  type AndroidUpdate, type DownloadState
} from './updateService'

export function AndroidUpdateNotice({ openUpdates }: { openUpdates: () => void }) {
  const [release, setRelease] = useState<AndroidUpdate | null>(null)
  useEffect(() => {
    let active = true
    void checkAndroidUpdates(false)
      .then((next) => {
        if (active && next && next.version !== localStorage.getItem('android.dismissedUpdate')) setRelease(next)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  if (!release) return null
  return (
    <aside className="flex items-center justify-between px-3 bg-accent-soft text-accent text-sm" aria-label="App update">
      <button type="button" className="py-2 underline" onClick={openUpdates}>
        Android {release.version} available · View update
      </button>
      <button type="button" className="py-2 px-2" onClick={() => {
        localStorage.setItem('android.dismissedUpdate', release.version)
        setRelease(null)
      }}>Dismiss</button>
    </aside>
  )
}

export default function AndroidUpdates() {
  const [enabled, setEnabled] = useState(autoChecksEnabled)
  const [release, setRelease] = useState<AndroidUpdate | null>(null)
  const [installed, setInstalled] = useState('')
  const [transfer, setTransfer] = useState<DownloadState | null>(null)
  const [operation, setOperation] = useState<'' | 'check' | 'download' | 'install'>('')
  const [message, setMessage] = useState('')
  const [statusError, setStatusError] = useState(false)
  const revision = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = ++revision.current
    try {
      const state = await apkUpdater.getStatus()
      if (ticket === revision.current) {
        setTransfer(state)
        setStatusError(false)
      }
    } catch {
      if (ticket === revision.current) setStatusError(true)
    }
  }, [])

  useEffect(() => {
    let live = true
    void App.getInfo().then(({ version }) => {
      if (live) {
        setInstalled(version)
        setRelease(cachedUpdate(version)?.release ?? null)
      }
    }).catch(() => {})
    if (autoChecksEnabled()) {
      void checkAndroidUpdates(false).then(next => { if (live) setRelease(next) }).catch(() => {})
    }
    void refresh()
    const onResume = App.addListener('resume', () => { if (live) void refresh() })
    return () => {
      live = false
      revision.current++
      void onResume.then(listener => listener.remove()).catch(() => {})
    }
  }, [refresh])

  useEffect(() => {
    if (transfer?.phase !== 'downloading') return
    let active = true
    let timer: number
    async function poll() {
      await refresh()
      if (active) timer = window.setTimeout(poll, 800)
    }
    timer = window.setTimeout(poll, 800)
    return () => { active = false; window.clearTimeout(timer) }
  }, [transfer?.phase, refresh])

  const retry = transfer?.phase === 'failed' && transfer.url && transfer.version
    ? { url: transfer.url, version: transfer.version } : null
  const candidate = retry && (!release || isNewerVersion(retry.version, release.version)) ? retry : release

  const run = async (action: 'check' | 'download' | 'install') => {
    setOperation(action)
    setMessage('')
    try {
      if (action === 'check') {
        const next = await checkAndroidUpdates(true)
        setRelease(next)
        if (!next) setMessage('No newer Android release is available.')
      } else if (action === 'download' && candidate) {
        revision.current++
        const next = await apkUpdater.download(candidate)
        revision.current++
        setTransfer(next)
        setStatusError(false)
      } else if (action === 'install') {
        await apkUpdater.install()
        await refresh()
      }
    } catch (e) {
      if (action === 'check') setMessage('Could not check for updates. Check your connection and try again.')
      else {
        setMessage(e instanceof Error ? e.message : 'Could not complete the update. Please try again.')
        await refresh()
      }
    } finally { setOperation('') }
  }

  const downloading = transfer?.phase === 'downloading'
  const ready = transfer?.phase === 'ready'
  const canDownload = candidate && !downloading &&
    (!ready || !transfer.version || isNewerVersion(candidate.version, transfer.version))
  const retrying = transfer?.phase === 'failed' && transfer.version === candidate?.version
  const total = transfer?.total ?? 0, received = transfer?.received ?? 0
  const percent = total > 0 ? Math.min(100, Math.round(100 * received / total)) : null
  return (
    <div className="phone-form">
      {installed && <p className="status">Installed version {installed}</p>}
      <label className="setting-row">
        Check GitHub on launch
        <input type="checkbox" checked={enabled} onChange={e => {
          setAutoChecks(e.target.checked)
          setEnabled(e.target.checked)
        }} />
      </label>
      <button type="button" className="phone-button" disabled={!!operation || downloading}
        onClick={() => void run('check')}>{operation === 'check' ? 'Checking…' : 'Check now'}</button>
      {canDownload && <>
        <p className="status">Android {candidate.version} is available.</p>
        <button type="button" className="phone-button primary" disabled={!!operation}
          onClick={() => void run('download')}>
          {operation === 'download' ? 'Starting download…' : retrying ? 'Retry download' : 'Download update'}
        </button>
      </>}
      {downloading && <>
        <p role="status">Downloading Android {transfer.version}…</p>
        <progress className="w-full accent-accent" aria-label="Update download" max={100} value={percent ?? undefined} />
        <span className="status">{percent !== null ? percent + '% · ' : ''}{(received / 1048576).toFixed(1)} MiB downloaded</span>
      </>}
      {ready && <>
        <p role="status">Android {transfer.version} is ready to install.</p>
        {!transfer.canInstall && <p className="status">
          Allow Open Bible Study to install apps in Android settings, then return here to install the update.
        </p>}
        <button type="button" className={'phone-button' + (canDownload ? '' : ' primary')} disabled={!!operation}
          onClick={() => void run('install')}>{transfer.canInstall ? 'Install update' : 'Allow installation'}</button>
      </>}
      {transfer?.phase === 'failed' && <p role="alert">{transfer.message || 'The update download failed.'}</p>}
      {statusError && <><p role="alert">Could not read the download status.</p>
        <button type="button" className="phone-button" onClick={() => void refresh()}>Refresh download status</button></>}
      {message && <p className="status" role="status">{message}</p>}
    </div>
  )
}
