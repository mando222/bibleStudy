import { SOURCE_WORD_TERMS, termEnabled } from '@shared/sourceWords'
import { useStrongs } from '@/hooks/useStrongs'
import { useAppStore } from '@/store/useAppStore'

export default function SourceWordSettings(): JSX.Element | null {
  const open = useAppStore(s => s.sourceWordSettingsOpen)
  const setOpen = useAppStore(s => s.setSourceWordSettingsOpen)
  const terms = useAppStore(s => s.sourceWordTerms)
  const sourceFormIds = useAppStore(s => s.sourceFormIds)
  const setTerm = useAppStore(s => s.setSourceTerm)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="source-word-settings"
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl bg-panel border border-line p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 id="source-word-settings" className="font-semibold text-ink">Words to restore</h2>
          <button autoFocus aria-label="Close word settings" onClick={() => setOpen(false)} className="text-muted px-2">✕</button>
        </div>
        <p className="mt-2 mb-4 text-sm text-muted">
          Choose which words to show when Restore words is on. The presets use a verified spelling in
          Latin letters. The four-letter Hebrew name displays as YHWH. For original script, select a
          word in the reader’s Lexicon panel.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {SOURCE_WORD_TERMS.map(({ label, ids }) => (
            <label key={ids[0]} className="flex items-center gap-3 py-1 text-sm text-ink">
              <input type="checkbox" className="accent-accent" checked={termEnabled(ids[0], terms)}
                onChange={e => setTerm(ids, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        {sourceFormIds.length > 0 && <section aria-labelledby="selected-source-forms" className="mt-4 pt-3 border-t border-line">
          <h3 id="selected-source-forms" className="font-medium text-sm text-ink">Original forms selected in the Lexicon</h3>
          <ul className="mt-1">{sourceFormIds.map(id => <SelectedSourceForm key={id} id={id} />)}</ul>
        </section>}
      </section>
    </div>
  )
}

function SelectedSourceForm({ id }: { id: string }): JSX.Element {
  const { entry } = useStrongs(id)
  const setSourceForm = useAppStore(s => s.setSourceForm)
  return <li className="py-1 flex gap-2 items-baseline text-sm">
    <span className="text-accent">{id}</span>
    {entry?.lemma && <bdi dir={entry.language === 'hebrew' ? 'rtl' : 'ltr'} className="text-ink">{entry.lemma}</bdi>}
    <button type="button" aria-label={`Remove ${id} from original forms`} className="ms-auto text-xs text-muted underline"
      onClick={() => setSourceForm(id, false)}>Remove</button>
  </li>
}
