import { useAppStore, DIVINE_NAMES_LIST } from '@/store/useAppStore'

/** Settings for the Divine Names feature: master on/off, per-name toggle + custom rendering. */
export default function DivineNamesModal(): JSX.Element | null {
  const open = useAppStore((s) => s.divineNamesModalOpen)
  const setOpen = useAppStore((s) => s.setDivineNamesModalOpen)
  const divineNames = useAppStore((s) => s.divineNames)
  const toggleDivineNames = useAppStore((s) => s.toggleDivineNames)
  const config = useAppStore((s) => s.divineNameConfig)
  const setEnabled = useAppStore((s) => s.setDivineNameEnabled)
  const setCustom = useAppStore((s) => s.setDivineNameCustom)
  const reset = useAppStore((s) => s.resetDivineNames)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-panel border-b border-line px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent">
            <span className="font-hebrew text-lg leading-none">יהוה</span>
            <span className="font-semibold text-ink">Divine Names</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md text-muted hover:bg-elevated hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 text-sm">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-line">
            <p className="text-muted leading-relaxed">
              Render the Hebrew names in place of their traditional English forms. Affects
              translations with Strong&rsquo;s tags (KJV, BSB).
            </p>
            <button
              onClick={toggleDivineNames}
              className={`shrink-0 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                divineNames
                  ? 'bg-accent border-accent text-white'
                  : 'border-line text-muted hover:bg-elevated'
              }`}
            >
              {divineNames ? 'On' : 'Off'}
            </button>
          </div>

          <div className={`mt-3 space-y-1 ${divineNames ? '' : 'opacity-50 pointer-events-none'}`}>
            <div className="grid grid-cols-[auto_5rem_1fr] items-center gap-3 px-1 pb-1 text-[11px] uppercase tracking-wider text-faint">
              <span>Use</span>
              <span>Usually</span>
              <span>Render as</span>
            </div>
            {DIVINE_NAMES_LIST.map((dn) => {
              const c = config[dn.strongs]
              const enabled = c?.enabled !== false
              return (
                <div
                  key={dn.strongs}
                  className="grid grid-cols-[auto_5rem_1fr] items-center gap-3 px-1 py-1.5 rounded-md hover:bg-elevated/50"
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(dn.strongs, e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-muted truncate" title={`${dn.hebrew} · ${dn.strongs}`}>
                    <span className="font-hebrew text-ink">{dn.hebrew}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-faint text-xs whitespace-nowrap">{dn.traditional} →</span>
                    <input
                      type="text"
                      value={c?.custom ?? ''}
                      placeholder={dn.default}
                      disabled={!enabled}
                      onChange={(e) => setCustom(dn.strongs, e.target.value)}
                      className="flex-1 min-w-0 rounded-md border border-line bg-elevated px-2 py-1 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
            <span className="text-xs text-faint">
              Leave a field blank to use the default. Choices persist across restarts.
            </span>
            <button onClick={reset} className="text-xs text-muted hover:text-accent underline">
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
