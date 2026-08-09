import { useEffect, useState } from 'react'
import type { LexBrowseEntry } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import LexiconCard from './LexiconCard'
import { SearchIcon } from './icons'

/** Full hand-browsable Greek/Hebrew word tool: browse the lexicon, then study any entry. */
export default function WordsView(): JSX.Element {
  const selected = useAppStore((s) => s.selectedStrongs)
  const selectStrongs = useAppStore((s) => s.selectStrongs)

  const [lang, setLang] = useState<'greek' | 'hebrew'>('greek')
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ total: number; entries: LexBrowseEntry[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      window.api
        .browseLexicon({ language: lang, query: q.trim(), limit: 250 })
        .then(setRes)
        .catch(() => setRes(null))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [lang, q])

  return (
    <div className="h-full flex bg-bg">
      {/* Browse list */}
      <div className="w-[23rem] shrink-0 border-r border-line flex flex-col bg-panel">
        <div className="p-3 border-b border-line space-y-2">
          <h2 className="font-serif text-lg text-ink">Word study</h2>
          <div className="flex gap-1">
            {(['greek', 'hebrew'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-0.5 rounded text-xs border ${
                  lang === l
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'border-line text-muted hover:bg-elevated'
                }`}
              >
                {l === 'greek' ? 'Greek' : 'Hebrew'}
              </button>
            ))}
            {res && (
              <span className="ml-auto self-center text-xs text-faint tabular-nums">
                {res.total.toLocaleString()}
              </span>
            )}
          </div>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Number, transliteration, or meaning…"
              className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink outline-none focus:border-accent placeholder:text-faint"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !res ? (
            <p className="text-sm text-muted p-3">Loading…</p>
          ) : res && res.entries.length > 0 ? (
            res.entries.map((e) => (
              <button
                key={e.id}
                onClick={() => selectStrongs(e.id)}
                className={`w-full text-left px-3 py-2 border-b border-line/40 hover:bg-elevated ${
                  selected === e.id ? 'bg-accent-soft' : ''
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono text-accent shrink-0">{e.id}</span>
                  <span
                    className={`${lang === 'hebrew' ? 'font-hebrew' : 'font-greek'} text-ink text-[15px]`}
                  >
                    {e.lemma}
                  </span>
                  <span className="text-xs text-faint truncate">{e.translit}</span>
                </div>
                {e.gloss && <div className="text-xs text-muted truncate mt-0.5">{e.gloss}</div>}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted p-3">No entries match “{q}”.</p>
          )}
        </div>
      </div>

      {/* Full entry for the selected word */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5">
        {selected ? (
          <div className="max-w-2xl">
            <LexiconCard id={selected} />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted">
            <p className="max-w-sm text-sm leading-relaxed">
              Pick a word on the left to study its full entry — definition, scholarly lexicons, and
              every place it occurs.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
