import { useLayoutEffect, useRef } from 'react'
import { defaultTextPreference, textEditionLabels, type TextPreference } from '@shared/textPreference'
import { useAppStore } from '@/store/useAppStore'

const groups = [
  { key: 'nt', heading: 'New Testament Greek' },
  { key: 'ot', heading: 'Old Testament texts' },
  { key: 'masoretic', heading: 'Hebrew marginal readings' }
] as const

export default function SettingsDialog(): JSX.Element | null {
  const open = useAppStore(s => s.settingsOpen)
  return open ? <PreferredTextSettings /> : null
}

function PreferredTextSettings(): JSX.Element {
  const order = useAppStore(s => s.preferredTextOrder)
  const setOrder = useAppStore(s => s.setPreferredTextOrder)
  const setOpen = useAppStore(s => s.setSettingsOpen)
  const dialog = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const modal = dialog.current!
    modal.showModal()
    return () => { modal.close() }
  }, [])

  function move(group: keyof TextPreference, index: number, direction: -1 | 1): void {
    const next = [...order[group]]
    const to = index + direction
    if (to < 0 || to >= next.length) return
    const other = next[to]
    next[to] = next[index]
    next[index] = other
    setOrder({ ...order, [group]: next })
  }

  return <dialog ref={dialog} aria-labelledby="settings-heading"
    onCancel={event => { event.preventDefault(); setOpen(false) }}
    onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}
    className="m-auto w-[min(34rem,90vw)] max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-black/40">
    <div className="p-5">
      <header className="flex items-center justify-between gap-4">
        <h2 id="settings-heading" className="text-lg font-semibold">Settings</h2>
        <button type="button" aria-label="Close settings" onClick={() => setOpen(false)}
          className="rounded px-2 py-1 text-muted hover:bg-elevated">✕</button>
      </header>
      <h3 className="mt-3 font-medium">Preferred text order</h3>
      <p className="mt-1 text-sm text-muted">
        Rank editions for the interlinear, Greek word searches and frequency maps, and textual comparisons.
        You can also select an edition in the interlinear or a Greek word map.
        Restored words follow the verified source for each translation.
      </p>
      {groups.map(({ key, heading }) => <section key={key} className="mt-4" aria-label={heading}>
        <h4 className="font-medium text-sm">{heading}</h4>
        {key === 'masoretic' && <p className="text-xs text-muted mt-0.5">Choose which form appears first in comparisons when both are recorded.</p>}
        <ol className="mt-1 list-decimal ps-6 text-sm marker:text-muted">
          {order[key].map((id, i) => <li key={id} className="border-b border-line/60">
            <div className="flex items-center gap-1 py-1">
              <span className="flex-1">{textEditionLabels[id]}</span>
              {([-1, 1] as const).map(direction => {
                const label = `Move ${textEditionLabels[id]} ${direction === -1 ? 'up' : 'down'}`
                const disabled = direction === -1 ? i === 0 : i === order[key].length - 1
                return <button key={direction} type="button" aria-label={label} title={label} aria-disabled={disabled}
                  onClick={() => move(key, i, direction)}
                  className={`rounded border border-line px-2.5 py-0.5 ${disabled ? 'opacity-35' : 'text-accent hover:bg-elevated'}`}>
                  {direction === -1 ? '↑' : '↓'}
                </button>
              })}
            </div>
          </li>)}
        </ol>
      </section>)}
      <button type="button" onClick={() => setOrder(defaultTextPreference)}
        className="mt-4 rounded border border-line px-2.5 py-1 text-sm text-muted hover:bg-elevated">Reset text order to defaults</button>
    </div>
  </dialog>
}
