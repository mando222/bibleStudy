import { useEffect, useState } from 'react'
import type { SearchResponse } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { SearchIcon } from './icons'
import Snippet from './Snippet'

type Scope = 'all' | 'OT' | 'NT'

export default function SearchPanel(): JSX.Element {
  const primary = useAppStore((s) => s.primary)
  const goToVerse = useAppStore((s) => s.goToVerse)

  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [res, setRes] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // Debounced search whenever the query, scope, or translation changes.
  useEffect(() => {
    const text = q.trim()
    if (!text) {
      setRes(null)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      window.api
        .search({ text, translation: primary, testament: scope, limit: 150 })
        .then((r) => setRes(r))
        .catch(() => setRes(null))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, scope, primary])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line space-y-2">
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
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
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && !res ? (
          <p className="text-sm text-muted p-2">Searching…</p>
        ) : res && res.hits.length > 0 ? (
          <ul className="space-y-1">
            {res.hits.map((h) => (
              <li key={`${h.book}-${h.chapter}-${h.verse}`}>
                <button
                  onClick={() => goToVerse(h.book, h.chapter, h.verse)}
                  className="w-full text-left rounded-md px-2 py-1.5 hover:bg-elevated"
                >
                  <div className="text-xs font-semibold text-accent">
                    {h.bookName} {h.chapter}:{h.verse}
                  </div>
                  <div className="text-sm text-ink leading-snug">
                    <Snippet text={h.snippet} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : res ? (
          <p className="text-sm text-muted p-2">No results for “{q}”.</p>
        ) : (
          <p className="text-sm text-muted p-2 leading-relaxed">
            Search the whole {primary}. Try <span className="text-accent">love</span>,{' '}
            <span className="text-accent">shepherd</span>, or a phrase.
          </p>
        )}
      </div>
    </div>
  )
}
