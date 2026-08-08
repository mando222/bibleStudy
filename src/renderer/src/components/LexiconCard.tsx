import { useStrongs } from '@/hooks/useStrongs'
import { useConcordance } from '@/hooks/useConcordance'
import { useAppStore } from '@/store/useAppStore'
import { HashIcon } from './icons'
import StrongsText from './StrongsText'
import Snippet from './Snippet'

export default function LexiconCard({ id }: { id: string | null }): JSX.Element {
  const { entry, loading } = useStrongs(id)

  if (!id) {
    return (
      <div className="mt-10 flex flex-col items-center text-center text-muted">
        <HashIcon className="w-8 h-8 text-faint mb-3" />
        <p className="text-sm max-w-[16rem] leading-relaxed">
          Click any word or Strong&rsquo;s number in the KJV to see its Greek or Hebrew lexicon
          entry and full concordance here.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-24 rounded bg-line/60" />
        <div className="h-10 w-40 rounded bg-line/60" />
        <div className="h-3 w-full rounded bg-line/50" />
        <div className="h-3 w-5/6 rounded bg-line/50" />
      </div>
    )
  }

  if (!entry) {
    return <p className="text-sm text-muted">No lexicon entry found for {id}.</p>
  }

  const isHeb = entry.language === 'hebrew'

  return (
    <div className="text-ink">
      <div className="flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-md bg-accent-soft text-accent text-xs font-semibold tabular-nums">
          {entry.id}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-faint">
          {isHeb ? 'Hebrew' : 'Greek'}
        </span>
      </div>

      <div
        dir={isHeb ? 'rtl' : 'ltr'}
        className={`mt-3 text-4xl leading-tight text-ink ${isHeb ? 'font-hebrew' : 'font-greek'}`}
      >
        {entry.lemma}
      </div>
      <div className="mt-1 text-muted">
        <span className="italic">{entry.translit}</span>
        {entry.pronunciation && <span className="text-faint"> · {entry.pronunciation}</span>}
      </div>

      <div className="mt-4 border-t border-line pt-3 space-y-3">
        {entry.definition && (
          <Field label="Definition">
            <StrongsText text={entry.definition} />
          </Field>
        )}
        {entry.kjvDef && (
          <Field label="KJV usage">
            <StrongsText text={entry.kjvDef} />
          </Field>
        )}
      </div>

      <Concordance id={entry.id} occurrences={entry.occurrences} />
    </div>
  )
}

function Concordance({ id, occurrences }: { id: string; occurrences: number }): JSX.Element {
  const { data, loading } = useConcordance(id)
  const goToVerse = useAppStore((s) => s.goToVerse)

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-faint">Concordance</span>
        <span className="text-xs text-muted tabular-nums">
          {data
            ? `${data.total.toLocaleString()} verses`
            : `${occurrences.toLocaleString()} occurrences`}{' '}
          · KJV
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading occurrences…</p>
      ) : data && data.hits.length > 0 ? (
        <>
          <ul className="space-y-0.5">
            {data.hits.map((h) => (
              <li key={`${h.book}-${h.chapter}-${h.verse}`}>
                <button
                  onClick={() => goToVerse(h.book, h.chapter, h.verse)}
                  className="w-full text-left rounded-md px-2 py-1.5 hover:bg-elevated"
                >
                  <span className="text-xs font-semibold text-accent whitespace-nowrap">
                    {h.bookName} {h.chapter}:{h.verse}
                  </span>{' '}
                  <span className="text-sm text-ink leading-snug">
                    <Snippet text={h.snippet} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data.total > data.hits.length && (
            <p className="text-xs text-faint px-2 pt-1">
              Showing first {data.hits.length.toLocaleString()} of {data.total.toLocaleString()}.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No tagged occurrences.</p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-faint mb-0.5">{label}</div>
      <div className="text-sm text-ink leading-relaxed">{children}</div>
    </div>
  )
}
