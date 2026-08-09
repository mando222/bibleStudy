import {
  useAppStore,
  QUICK_REPLACE_LIST,
  QUICK_REPLACE_CATEGORIES,
  type QuickReplaceItem
} from '@/store/useAppStore'

/** Settings for Quick Replace: master on/off, per-term toggle + custom rendering, grouped by theme. */
export default function QuickReplaceModal(): JSX.Element | null {
  const open = useAppStore((s) => s.quickReplaceModalOpen)
  const setOpen = useAppStore((s) => s.setQuickReplaceModalOpen)
  const quickReplace = useAppStore((s) => s.quickReplace)
  const toggleQuickReplace = useAppStore((s) => s.toggleQuickReplace)
  const config = useAppStore((s) => s.quickReplaceConfig)
  const setEnabled = useAppStore((s) => s.setQuickReplaceEnabled)
  const setCustom = useAppStore((s) => s.setQuickReplaceCustom)
  const reset = useAppStore((s) => s.resetQuickReplace)

  if (!open) return null

  const isEnabled = (item: QuickReplaceItem): boolean => {
    const c = config[item.strongs]
    return c ? c.enabled : !!item.defaultOn
  }
  const isHebrew = (s: string): boolean => s.startsWith('H')

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
            <span className="text-lg leading-none">⇄</span>
            <span className="font-semibold text-ink">Quick Replace</span>
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
              Show the <span className="text-ink">original word</span> in place of its usual English
              rendering — never a new interpretation. Affects translations with Strong&rsquo;s tags
              (KJV, BSB).
            </p>
            <button
              onClick={toggleQuickReplace}
              className={`shrink-0 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                quickReplace
                  ? 'bg-accent border-accent text-white'
                  : 'border-line text-muted hover:bg-elevated'
              }`}
            >
              {quickReplace ? 'On' : 'Off'}
            </button>
          </div>

          <div className={`mt-3 space-y-4 ${quickReplace ? '' : 'opacity-50 pointer-events-none'}`}>
            {QUICK_REPLACE_CATEGORIES.map((cat) => {
              const items = QUICK_REPLACE_LIST.filter((i) => i.category === cat.id)
              if (!items.length) return null
              return (
                <div key={cat.id}>
                  <div className="text-[11px] uppercase tracking-wider text-faint px-1 pb-1">
                    {cat.label}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const c = config[item.strongs]
                      const enabled = isEnabled(item)
                      return (
                        <div
                          key={item.strongs}
                          className="grid grid-cols-[auto_5.5rem_1fr] items-center gap-3 px-1 py-1.5 rounded-md hover:bg-elevated/50"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(item.strongs, e.target.checked)}
                            className="accent-accent"
                          />
                          <span
                            className={`truncate text-ink ${isHebrew(item.strongs) ? 'font-hebrew' : 'font-greek'}`}
                            title={`${item.glyph} · ${item.strongs}`}
                          >
                            {item.glyph}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-faint text-xs whitespace-nowrap">
                              {item.traditional} →
                            </span>
                            <input
                              type="text"
                              value={c?.custom ?? ''}
                              placeholder={item.default}
                              disabled={!enabled}
                              onChange={(e) => setCustom(item.strongs, e.target.value)}
                              className="flex-1 min-w-0 rounded-md border border-line bg-elevated px-2 py-1 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
            <span className="text-xs text-faint">
              Blank uses the default. Only Strong&rsquo;s-tagged words change. Choices persist.
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
