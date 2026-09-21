import { useEffect, useState } from 'react'
import type { UpdateInfo, UpdateProgress } from '@shared/types'
import { SparkleIcon } from './icons'

type Stage =
  | { at: 'idle' }
  | { at: 'downloading'; progress: UpdateProgress }
  | { at: 'done' }
  | { at: 'error'; message: string }

const mb = (bytes: number): string => (bytes / 1_048_576).toFixed(1)
const isMac = navigator.userAgent.includes('Mac')

/**
 * A slim, dismissible bar shown when a newer release exists. The check itself is opt-out and
 * silent (see src/main/updates.ts) — this renders nothing at all when there's nothing to say,
 * which includes every offline launch.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [stage, setStage] = useState<Stage>({ at: 'idle' })

  // Ignore progress that arrives once we've stopped downloading, so a trailing chunk can't
  // knock the bar back out of its finished state.
  useEffect(
    () =>
      window.updates?.onProgress((progress) =>
        setStage((prev) => (prev.at === 'downloading' ? { at: 'downloading', progress } : prev))
      ),
    []
  )

  useEffect(() => {
    let cancelled = false
    // Off the startup path: the reader is usable immediately whether or not this ever resolves.
    const t = window.setTimeout(() => {
      window.updates
        ?.check()
        .then((u) => {
          if (!cancelled) setInfo(u)
        })
        .catch(() => undefined)
    }, 3000)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [])

  if (!info) return null

  const download = async (): Promise<void> => {
    if (!info.assetName) return
    setStage({ at: 'downloading', progress: { received: 0, total: 0 } })
    const res = await window.updates
      ?.download(info.downloadUrl, info.assetName)
      .catch(() => ({ ok: false as const, error: 'Download failed.' }))
    setStage(res?.ok ? { at: 'done' } : { at: 'error', message: res?.error ?? 'Download failed.' })
  }

  const dismiss = (): void => {
    void window.updates?.dismiss(info.latest)
    setInfo(null)
  }

  return (
    <div className="relative shrink-0 border-b border-accent/30 bg-accent-soft/60 px-3 py-1.5 flex items-center gap-2 text-sm">
      <SparkleIcon className="w-4 h-4 text-accent shrink-0" />
      <span className="text-ink">
        Version <span className="font-semibold text-accent">{info.latest}</span> is available
        <span className="text-muted"> — you have {info.current}.</span>
      </span>

      {info.notes && (
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="text-xs text-muted hover:text-accent underline whitespace-nowrap"
        >
          {showNotes ? 'Hide notes' : "What's new"}
        </button>
      )}

      <div className="flex-1" />

      {/* Without a matching installer for this machine there's nothing to fetch — send the
          reader to the release page and let them choose. */}
      {!info.assetName ? (
        <button
          onClick={() => void window.updates?.openDownload(info.downloadUrl)}
          title="Open the release page"
          className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 whitespace-nowrap"
        >
          Update
        </button>
      ) : stage.at === 'downloading' ? (
        <Downloading progress={stage.progress} />
      ) : stage.at === 'done' ? (
        <>
          <span className="text-xs text-muted whitespace-nowrap">
            Saved to Downloads — install it whenever you like.
          </span>
          <button
            onClick={() => void window.updates?.revealDownload()}
            className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 whitespace-nowrap"
          >
            {isMac ? 'Show in Finder' : 'Show in folder'}
          </button>
        </>
      ) : (
        <>
          {stage.at === 'error' && (
            <span className="text-xs text-muted whitespace-nowrap">{stage.message}</span>
          )}
          <button
            onClick={() => void download()}
            title={info.assetName}
            className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 whitespace-nowrap"
          >
            {stage.at === 'error' ? 'Try again' : 'Download'}
          </button>
          <button
            onClick={() => void window.updates?.openDownload(info.downloadUrl)}
            title="Download in your browser instead"
            className="text-xs text-muted hover:text-accent underline whitespace-nowrap"
          >
            In browser
          </button>
        </>
      )}
      <button
        onClick={dismiss}
        title="Stop showing this until the next version"
        className="w-6 h-6 rounded text-muted hover:text-accent hover:bg-elevated text-xs leading-none"
      >
        ✕
      </button>

      {showNotes && (
        <div className="absolute left-0 right-0 top-full z-30 mx-3 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-panel p-3 shadow-2xl">
          <div className="text-[11px] uppercase tracking-wider text-faint mb-1.5">
            What&rsquo;s new in {info.latest}
          </div>
          <pre className="whitespace-pre-wrap text-xs text-ink leading-relaxed font-sans">
            {info.notes}
          </pre>
          <a
            href={info.releaseUrl}
            onClick={(e) => {
              e.preventDefault()
              void window.updates?.openDownload(info.releaseUrl)
            }}
            className="mt-2 inline-block text-xs text-accent hover:underline"
          >
            Full release notes on GitHub →
          </a>
        </div>
      )}
    </div>
  )
}

/**
 * The app stays fully usable while this runs. That matters most on macOS, where a running app
 * can't replace its own bundle — so the download has to be able to finish now and be installed
 * later, rather than forcing a quit up front.
 */
function Downloading({ progress }: { progress: UpdateProgress }): JSX.Element {
  const pct = progress.total ? Math.round((progress.received / progress.total) * 100) : null
  return (
    <>
      <div className="h-1.5 w-28 rounded-full bg-elevated overflow-hidden" title="Downloading">
        <div
          className={`h-full bg-accent transition-[width] duration-150 ${pct === null ? 'animate-pulse w-1/3' : ''}`}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted tabular-nums whitespace-nowrap">
        {pct === null ? `${mb(progress.received)} MB` : `${pct}%`}
      </span>
      <button
        onClick={() => void window.updates?.cancelDownload()}
        className="text-xs text-muted hover:text-accent underline whitespace-nowrap"
      >
        Cancel
      </button>
    </>
  )
}
