import { useEffect, useState } from 'react'
import type { UpdateInfo } from '@shared/types'
import { SparkleIcon } from './icons'

/**
 * A slim, dismissible bar shown when a newer release exists. The check itself is opt-out and
 * silent (see src/main/updates.ts) — this renders nothing at all when there's nothing to say,
 * which includes every offline launch.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [showNotes, setShowNotes] = useState(false)

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

      <button
        onClick={() => void window.updates?.openDownload(info.downloadUrl)}
        title={info.assetName ?? 'Open the release page'}
        className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 whitespace-nowrap"
      >
        Update
      </button>
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
