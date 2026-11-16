import ModalDialog from './ModalDialog'
import { SOURCE_WORD_TERMS, termEnabled } from '@shared/sourceWords'
import { useStrongs } from '@/hooks/useStrongs'
import { useAppStore } from '@/store/useAppStore'

export default function SourceWordSettings(): JSX.Element | null {
  const open = useAppStore(s => s.sourceWordSettingsOpen)
  const setOpen = useAppStore(s => s.setSourceWordSettingsOpen)
  const terms = useAppStore(s => s.sourceWordTerms)
  const sourceFormIds = useAppStore(s => s.sourceFormIds)
  const setTerm = useAppStore(s => s.setSourceTerm)
  const restoring = useAppStore(s => s.restoreSourceWords)
  const toggle = useAppStore(s => s.toggleSourceWords)
  if (!open) return null

  return (
    <ModalDialog label="Words to restore" className="w-[min(32rem,90vw)]" close={() => setOpen(false)}>
      <section className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="source-word-settings" className="font-semibold text-ink">Words to restore</h2>
          <button aria-label="Close word settings" onClick={() => setOpen(false)} className="text-muted px-2">✕</button>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="accent-accent" checked={restoring} onChange={toggle} />
          Show verified source words in the reader
        </label>
        <p className="mt-2 mb-4 text-sm text-muted">
          Each selected term displays its verified form in Latin letters. In BSB 1 Corinthians 7:3,
          the two uses of “wife” show <i>gynaiki</i> and <i>gynē</i>. A term appears only where the edition has a verified link to that occurrence. The four-letter Hebrew name appears as YHWH. Copies keep the translation’s printed wording.
        </p>
        <h3 className="text-sm font-medium mb-1">Words to show {restoring ? '' : 'when switched on'}</h3>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {SOURCE_WORD_TERMS.map(({ label, ids }) => {
            const count = ids.filter(id => termEnabled(id, terms)).length
            return (
            <label key={ids[0]} className="flex items-center gap-3 py-1 text-sm text-ink">
              <input type="checkbox" className="accent-accent" checked={count === ids.length}
                ref={el => { if (el) el.indeterminate = count > 0 && count < ids.length }}
                onChange={e => setTerm(ids, e.target.checked)} />
              {label}
            </label>
            )
          })}
        </div>
        {sourceFormIds.length > 0 && <section aria-labelledby="selected-source-forms" className="mt-4 pt-3 border-t border-line">
          <h3 id="selected-source-forms" className="font-medium text-sm text-ink">Original forms selected in the Lexicon</h3>
          <p className="mt-1 text-xs text-muted">These entries use the source script in the reader. Other presets use Latin letters.</p>
          <ul className="mt-1">{sourceFormIds.map(id => <SelectedSourceForm key={id} id={id} />)}</ul>
        </section>}
      </section>
    </ModalDialog>
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
