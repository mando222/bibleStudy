import { Fragment, useRef } from 'react'
import { useEditions, useInterlinear } from '@/hooks/useInterlinear'
import { useVerseNavigation } from '@/hooks/useVerseNavigation'
import { originalTextEdition, useAppStore } from '@/store/useAppStore'
import { readerChapter } from '@/lib/passage'
import { mapPassage } from '@shared/passageMapping'
import { editionDisplay } from '@shared/readingDisplay'
import { sweteEditionLabel } from '@shared/lxxIntegrity'
import { ReadingDisplay } from './ReadingTools'
import { BOOK_BY_ID } from '@shared/books'
import InterlinearVerse from './InterlinearVerse'
import { BookIcon } from './icons'

export default function InterlinearReader({
  book,
  chapter
}: {
  book: string
  chapter: number
}): JSX.Element {
  const catalog = useEditions()
  const editions = catalog.editions
  const stored = useAppStore((s) => s.interlinearEdition)
  const setEdition = useAppStore((s) => s.setInterlinearEdition)
  const translations = useAppStore((s) => s.translations)
  const stack = useAppStore((s) => s.interlinearStack)
  const toggleStack = useAppStore((s) => s.toggleInterlinearStack)
  const parses = useAppStore((s) => s.interlinearParses)
  const toggleParses = useAppStore((s) => s.toggleInterlinearParses)

  const fromEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const inspect = useAppStore(s => s.inspectStudy)
  const testament = BOOK_BY_ID[book]?.testament ?? 'NT'
  const applicable = editions.filter((e) => e.testament === testament)
  const defaultEdition = useAppStore(s => originalTextEdition(s, testament, ''))
  const selectedEdition = useAppStore(s => originalTextEdition(s, testament))
  const effective = applicable.find(e => e.id === selectedEdition)?.id ?? ''
  const swete = effective === 'LXX'
  const editionName = (id: string, name: string) => id === 'LXX' ? sweteEditionLabel(book) : name
  const defaultItem = applicable.find(e => e.id === defaultEdition)
  const defaultName = defaultItem && editionName(defaultItem.id, defaultItem.name)
  const defaults = useAppStore(s => s.displayDefaults)
  const overrides = useAppStore(s => s.displayOverrides)
  const display = editionDisplay(defaults, overrides, effective)

  // All bundled translations can be stacked: Strong's-tagged ones align word-for-word, the rest
  // show as a verse line beneath the grid.
  const stackable = translations.filter((t) => t.language !== 'imported' && !(swete && t.id === 'LXX'))
  const labels = Object.fromEntries(stackable.map((t) => [t.id, t.abbrev]))
  const native = effective && !fromEdition.startsWith('imp_') ? readerChapter(book, chapter, activeVerse, fromEdition, effective) : null
  const selected = native && activeVerse != null ? mapPassage({ book, chapter, verse: activeVerse }, fromEdition, effective) : null
  const { data, loading, error } = useInterlinear(native?.book ?? book, native?.chapter ?? chapter, native ? effective : '', stack, parses && !swete)
  // Inferred alignments are returned too, even when metadata says hasStrongs=false.
  const wordStack = stack.filter((id) =>
    data?.verses.some((v) => v.tokens.some((t) => t.aligned?.[id]))
  )
  const container = useRef<HTMLDivElement>(null)
  useVerseNavigation(container, `${native?.book}:${native?.chapter}:${effective}`, !loading && !!data, true, effective)

  return (
    <div ref={container} className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className="text-[11px] uppercase tracking-wider text-faint">
            Interlinear · {native && <>{BOOK_BY_ID[native.book]?.name ?? native.book}{display.chapterNumbers && ` ${native.chapter}`} · </>}base text
          </span>
          <select
            aria-label="Interlinear base text"
            value={stored === effective ? effective : ''}
            onChange={(e) => setEdition(e.target.value)}
            className="bg-elevated border border-line rounded-md text-sm px-2 py-1 text-ink outline-none focus:border-accent"
          >
            <option value="">Use global setting{defaultName ? ' · ' + defaultName : ''}</option>
            {applicable.map((e) => (
              <option key={e.id} value={e.id}>
                {editionName(e.id, e.name)}
              </option>
            ))}
          </select>
          {effective && <ReadingDisplay editionIds={[effective]} interlinear />}
          {data && data.verses.length > 0 && (
            <span className="text-xs text-faint">
              {data.direction === 'rtl' ? 'Hebrew / Aramaic · read right-to-left' : 'Greek'}
            </span>
          )}
          {native && data?.verses.length ? <button className="text-xs text-muted hover:text-accent" onClick={() => {
            inspect({ mode: 'context', range: { ...native, edition: effective, firstVerse: selected?.verse } })
          }}>Context</button> : null}
          {!swete && <button
            onClick={toggleParses}
            title="Switch between the single best-guess analysis and every Scripture-attested parse of each word"
            className={`ml-auto text-xs px-2 py-1 rounded-md border transition-colors ${
              parses ? 'bg-accent-soft border-accent text-accent' : 'border-line text-muted hover:bg-elevated'
            }`}
          >
            {parses ? 'All parses' : 'Best guess'}
          </button>}
          {stackable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              <span className="text-[11px] uppercase tracking-wider text-faint">Stack</span>
              {stackable.map((t) => {
                const on = stack.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleStack(t.id)}
                    aria-pressed={on}
                    title={swete ? `Show the corresponding verse from ${t.name}` : `Align ${t.name} under each word (by Strong's)`}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      on
                        ? 'bg-accent-soft border-accent text-accent'
                        : 'border-line text-muted hover:bg-elevated'
                    }`}
                  >
                    {t.abbrev}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {swete && <p className="text-xs text-muted mb-4">{sweteEditionLabel(book)}. Each Greek word appears with its transliteration.
          {' '}This source supplies no word-by-word glosses or grammatical analyses.</p>}
        {parses && !swete && (
          <p className="text-[11px] text-muted -mt-3 mb-4 leading-relaxed">
            Every analysis each form receives in the scholar-tagged text (STEPBible), with how often
            it&rsquo;s attested; the contextual best guess is highlighted. Matching is
            accent-insensitive, and nothing here is generated.
          </p>
        )}

        {data && effective === 'MT' && data.masoreticAttestationAvailable === false && (
          <p className="text-xs text-muted mb-3">This database has no word-by-word Masoretic source codes.</p>
        )}
        {data && testament === 'NT' && data.uncertainOrderVerses === undefined && (
          <p className="text-xs text-muted mb-3">This database has no verse-level checks for Greek word order.</p>
        )}
        {selected && data?.verses.length && !data.verses.some(v => v.verse === selected.verse) ? (
          <p className="text-sm text-muted mb-4" role="status">No verse text is recorded for {BOOK_BY_ID[selected.book]?.name} {selected.chapter}:{selected.verse} in {effective}.</p>
        ) : null}
        {catalog.error ? <p role="alert" className="text-sm text-muted">Couldn’t load the available editions. <button className="underline" onClick={catalog.retry}>Try again</button></p>
        : effective && !native ? <p className="text-sm text-muted">No verified equivalent in {effective}.</p> : catalog.loading || loading ? (
          <div className="animate-pulse space-y-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-line/50" style={{ width: `${80 - (i % 3) * 12}%` }} />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-muted">Couldn’t load the {effective} interlinear. {error}</p>
        ) : !data || data.verses.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <BookIcon className="w-10 h-10 text-faint mb-3" />
            <p className="text-sm text-ink font-medium">No original text</p>
            <p className="text-sm text-muted max-w-xs mt-1">
              {effective ? 'This edition has no recorded text for this passage.' : 'No original-language edition is available for this testament.'}
            </p>
          </div>
        ) : (
          data.verses.map((v) => (
            <Fragment key={v.verse}>
              {data.uncertainOrderVerses?.includes(v.verse) && <p className="text-xs text-muted mb-1">
                Verse {v.verse} · The word order in this reading could not be verified.
              </p>}
              <InterlinearVerse
                v={{ verse: v.verse, text: '', tokens: v.tokens }}
                onSelectVerse={() => useAppStore.getState().focusVerse(data.book, data.chapter, v.verse, effective)}
                verseNumbers={display.verseNumbers}
                rtl={data.direction === 'rtl'}
                stack={wordStack}
                labels={labels}
                lines={v.lines}
                showParses={parses}
                swete={swete}
                sourceIssue={v.sourceIssue}
              />
            </Fragment>
          ))
        )}
      </div>
    </div>
  )
}
