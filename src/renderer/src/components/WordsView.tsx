import { useCallback, useEffect, useState } from 'react'
import { lexiconLanguage } from '@shared/lexiconId'
import { usePagedQuery } from '@/hooks/usePagedQuery'
import ResultPages from './ResultPages'
import { useAppStore } from '@/store/useAppStore'
import LexiconCard from './LexiconCard'
import { SearchIcon } from './icons'

/** Full hand-browsable Greek/Hebrew word tool: browse the lexicon, then study any entry. */
export default function WordsView({ openEntry }: { openEntry?: { id: string } } = {}): JSX.Element {
  const [selected, setSelected] = useState(() => useAppStore.getState().selectedStrongs)
  const [occurrence, setOccurrence] = useState(() => useAppStore.getState().selectedOccurrence)
  useEffect(() => useAppStore.subscribe((s, previous) => {
    if (s.activity === 'words' && (s.selectedStrongs !== previous.selectedStrongs || s.selectedOccurrence !== previous.selectedOccurrence)) {
      setSelected(s.selectedStrongs)
      setOccurrence(s.selectedOccurrence)
    }
  }), [])
  const selectStrongs = useAppStore((s) => s.selectStrongs)

  const [lang, setLang] = useState<'greek' | 'hebrew'>(() => selected?.startsWith('H') ? 'hebrew' : 'greek')
  const [detail, setDetail] = useState(!!openEntry)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (openEntry) {
      const language = openEntry.id.startsWith('H') ? 'hebrew' : 'greek'
      setSelected(openEntry.id)
      setOccurrence(useAppStore.getState().selectedOccurrence)
      setDetail(true)
      setLang(language)
      setQ(value => lexiconLanguage(value) && lexiconLanguage(value) !== language ? '' : value)
    }
  }, [openEntry])
  const query = q.trim()
  const fetchPage = useCallback((offset: number) =>
    window.api.browseLexicon({ language: lang, query, limit: 250, offset }), [lang, query])
  const { data: res, error, loading, offset, setOffset, retry } =
    usePagedQuery(JSON.stringify([lang, query]), fetchPage, 200)

  function studyWord(id: string) {
    setSelected(id)
    setOccurrence(null)
    selectStrongs(id)
    setDetail(true)
  }

  return (
    <div data-directory={detail ? 'detail' : 'list'} className="h-full flex bg-bg">
      {/* Browse list */}
      <div className="w-[clamp(14rem,31%,23rem)] shrink-0 border-r border-line flex flex-col bg-panel">
        <div className="p-3 border-b border-line space-y-2">
          <h2 className="font-serif text-lg text-ink">Word study</h2>
          <div className="flex gap-1">
            {(['greek', 'hebrew'] as const).map((l) => (
              <button
                key={l}
                aria-pressed={lang === l}
                onClick={() => {
                  if (lexiconLanguage(query) && l !== lang) setQ('')
                  setLang(l)
                }}
                className={`px-2.5 py-0.5 rounded text-xs border ${
                  lang === l
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'border-line text-muted hover:bg-elevated'
                }`}
              >
                {l === 'greek' ? 'Greek' : 'Hebrew / Aramaic'}
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
              onChange={(e) => {
                const value = e.target.value
                setQ(value)
                const language = lexiconLanguage(value)
                if (language) setLang(language)
              }}
              aria-label="Search by number, original word, transliteration, or meaning"
              placeholder="Number, word, transliteration, or meaning…"
              className="w-full bg-elevated border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink outline-none focus:border-accent placeholder:text-faint"
            />
          </div>
        </div>

        {res && <div className="px-3"><ResultPages offset={offset} size={250} count={res.entries.length} total={res.total} onPage={setOffset} /></div>}
        <div key={offset} className="flex-1 overflow-y-auto">
          {error ? <p role="alert" className="p-3 text-sm">{error} <button onClick={retry}>Try again</button></p> : loading && !res ? (
            <p className="text-sm text-muted p-3">Loading…</p>
          ) : res && res.entries.length > 0 ? (
            res.entries.map((e) => (
              <button
                key={e.id}
                aria-pressed={selected === e.id}
                onClick={() => studyWord(e.id)}
                className={`w-full text-left px-3 py-2 border-b border-line/40 hover:bg-elevated ${
                  selected === e.id ? 'bg-accent-soft' : ''
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono text-accent shrink-0">{e.id}</span>
                  <span
                    dir={lang === 'hebrew' ? 'rtl' : 'ltr'}
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
        {import.meta.env.VITE_STUDY_MOBILE === 'true' && detail && <button data-phone-back className="directory-back" onClick={()=>setDetail(false)}>‹ All words</button>}
        {selected ? (
          <div className="max-w-3xl">
            <LexiconCard id={selected} inWords savedOccurrence={occurrence} chooseWord={id => {
              setLang(id.startsWith('H') ? 'hebrew' : 'greek')
              setQ(id)
              studyWord(id)
            }} />
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
