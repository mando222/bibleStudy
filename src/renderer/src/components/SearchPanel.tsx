import { useCallback, useState } from 'react'
import { usePagedQuery } from '@/hooks/usePagedQuery'
import ResultPages from './ResultPages'
import { originalTextEdition, useAppStore } from '@/store/useAppStore'
import { SearchIcon } from './icons'
import Snippet from './Snippet'

type Scope = 'all' | 'OT' | 'NT'

export default function SearchPanel(): JSX.Element {
  const primary = useAppStore((s) => s.primary)
  const openSearchHit = useAppStore((s) => s.openSearchHit)

  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const greekEdition = useAppStore(s => originalTextEdition(s, 'NT', s.interlinear ? s.interlinearEdition : '') || undefined)
  const text = q.trim()
  const fetchPage = useCallback((offset: number) =>
    window.api.search({ text, translation: primary, testament: scope, greekEdition, limit: 150, offset }),
    [text, primary, scope, greekEdition])
  const { data: res, loading, error, offset, setOffset, retry } =
    usePagedQuery(JSON.stringify([text, primary, scope, greekEdition]), fetchPage, 250, !!text)

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line space-y-2">
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            aria-label={`Search ${primary}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${primary}…`}
            className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink outline-none focus:border-accent placeholder:text-faint"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'OT', 'NT'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`px-2 py-0.5 rounded text-xs border ${
                scope === s ? 'bg-accent-soft border-accent text-accent' : 'border-line text-muted hover:bg-elevated'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
          {res && (
            <span className="ml-auto self-center text-xs text-faint tabular-nums">
              {res.total.toLocaleString()} result{res.total === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {res && <ResultPages offset={offset} size={150} count={res.hits.length} total={res.total} onPage={setOffset} />}
      </div>

      <div key={offset} className="flex-1 overflow-y-auto p-2" aria-busy={loading}>
        {error ? (
          <div role="alert" className="text-sm text-muted p-2 space-y-2">
            <p>Search couldn’t finish. {error}</p>
            <button onClick={retry} className="text-accent underline">Try again</button>
          </div>
        ) : loading ? (
          <p role="status" className="text-sm text-muted p-2">Searching…</p>
        ) : res && res.hits.length > 0 ? (
          <ul className="space-y-1">
            {res.hits.map((h) => (
              <li key={`${h.edition ?? h.translation ?? primary}-${h.book}-${h.chapter}-${h.verse}`}>
                <button
                  onClick={() => openSearchHit(h)}
                  className="w-full text-left rounded-md px-2 py-1.5 hover:bg-elevated"
                >
                  <div className="text-xs font-semibold text-accent">
                    {h.bookName} {h.chapter}:{h.verse} {h.edition ?? (h.translation !== primary ? h.translation : '')}
                  </div>
                  <div className="text-sm text-ink leading-snug">
                    <Snippet text={h.snippet} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : res?.notice ? (
          <p role="status" className="text-sm text-muted p-2">{res.notice}</p>
        ) : res ? (
          <p className="text-sm text-muted p-2">No results for “{q}”.</p>
        ) : (
          <p className="text-sm text-muted p-2 leading-relaxed">
            Search the whole {primary} — a word or phrase (<span className="text-accent">love</span>
            , <span className="text-accent">shepherd</span>), a Strong&rsquo;s number (
            <span className="text-accent">G26</span>, <span className="text-accent">H430</span>), or
            a Greek/Hebrew word (<span className="font-greek text-accent">ἀγάπη</span>).
          </p>
        )}
      </div>
    </div>
  )
}
