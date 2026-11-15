import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { InterlinearContent } from '@shared/types'
import { chapterKey, useChapterStream } from '@/hooks/useChapterStream'
import { useEditions, useInterlinear } from '@/hooks/useInterlinear'
import { useVerseNavigation } from '@/hooks/useVerseNavigation'
import { originalTextEdition, useAppStore } from '@/store/useAppStore'
import { readerViewKey, recordPosition, restorePosition, type ReadingPosition } from '@/lib/readingPosition'
import { readerChapter } from '@/lib/passage'
import { mapPassage } from '@shared/passageMapping'
import { editionDisplay } from '@shared/readingDisplay'
import { sweteEditionLabel } from '@shared/lxxIntegrity'
import { ReadingDisplay } from './ReadingTools'
import { BOOK_BY_ID } from '@shared/books'
import PassageKeyboard from './PassageKeyboard'
import InterlinearVerse from './InterlinearVerse'
import { BookIcon } from './icons'

export default function InterlinearReader({
  book,
  chapter, initial, consumeInitial
}: {
  book: string
  chapter: number
  initial?: ReadingPosition | null
  consumeInitial?: () => void
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

  // Only translations with an edition-specific occurrence link can contribute a word row.
  const stackable = translations.filter((t) => t.language !== 'imported' && !(swete && t.id === 'LXX'))
  const labels = Object.fromEntries(stackable.map((t) => [t.id, t.abbrev]))
  const native = effective && !fromEdition.startsWith('imp_') ? readerChapter(book, chapter, activeVerse, fromEdition, effective) : null
  const selected = native && activeVerse != null ? mapPassage({ book, chapter, verse: activeVerse }, fromEdition, effective) : null
  const container = useRef<HTMLDivElement>(null)
  const ref = { translation: native ? effective : '', book: native?.book ?? book, chapter: native?.chapter ?? chapter }
  const stream = useChapterStream(container, ref, true)
  const activeKey = [chapterKey(ref), ref.translation, stack.join(','), parses].join('/')
  const [loaded, setLoaded] = useState<{ key: string; data: InterlinearContent } | null>(null)
  const data = loaded?.key === activeKey ? loaded.data : null
  useVerseNavigation(container, ref, !!data, true, true)

  useEffect(() => {
    if (!data || !initial || !container.current || initial.translation !== effective ||
        initial.book !== ref.book || initial.chapter !== ref.chapter) return
    restorePosition(container.current, initial)
    consumeInitial?.()
  }, [data, initial, effective])
  function scrollInput() {
    stream.input()
    if (container.current) delete container.current.dataset.readerAnchor
  }

  const controls = (
        <div className="flex flex-wrap items-center gap-3">
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
              <span className="text-[11px] uppercase tracking-wider text-faint">Stack translations</span>
              {stackable.map((t) => {
                const on = stack.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleStack(t.id)}
                    aria-pressed={on}
                    title={`Show ${t.name} for this passage, with word links where verified`}
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
  )
  return (
    <div className="h-full flex flex-col">
      <div data-interlinear-tools="" className="shrink-0 max-h-[40%] overflow-y-auto border-b border-line">
      <div className="max-w-5xl mx-auto px-8 py-2">
        {import.meta.env.VITE_STUDY_MOBILE === 'true' ? <details className="interlinear-options mb-3">
          <summary>Interlinear options · {effective || 'Base text'}{stack.length ? ' · ' + stack.join(', ') : ''}</summary>
          {controls}
        </details> : <div className="mb-5">{controls}</div>}

        {swete && <p className="text-xs text-muted mb-4">{sweteEditionLabel(book)}. Each Greek word appears with its transliteration.
          {' '}This source supplies no word-by-word glosses or grammatical analyses.</p>}
        {parses && !swete && (
          <p className="text-[11px] text-muted -mt-3 mb-4 leading-relaxed">
            Every analysis each form receives in the scholar-tagged text (STEPBible), with how often
            it&rsquo;s attested; the contextual best guess is highlighted. Matching is
            accent-insensitive, and nothing here is generated.
          </p>
        )}

      </div>
      </div>
      <div ref={container} data-interlinear-reader="" data-reader-edition={effective} data-reader-book={native?.book}
        data-reader-chapter={native?.chapter} onWheelCapture={scrollInput} onPointerDownCapture={scrollInput}
        onKeyDownCapture={scrollInput} onScroll={e => {
          if (!stream.crossBoundary() && data) recordPosition(e.currentTarget, ref.book, ref.chapter, effective, true, readerViewKey(useAppStore.getState()))
        }} style={{ overflowAnchor: 'none' }} className="flex-1 min-h-0 overflow-y-auto">
        {catalog.error ? <p role="alert" className="p-4 text-sm text-muted">Couldn’t load the available editions. <button className="underline" onClick={catalog.retry}>Try again</button></p>
        : effective && !native ? <p className="p-4 text-sm text-muted">No verified equivalent in {effective}.</p>
        : stream.pages.map((page, i) => {
          const active = chapterKey(page) === chapterKey(ref)
          return <InterlinearChapter key={chapterKey(page)} {...page} effective={ref.translation} stack={stack} labels={labels}
            parses={parses} active={active} before={!active && i === 0}
            chapterNumbers={display.chapterNumbers} verseNumbers={display.verseNumbers} selected={active ? selected || null : null}
            catalogLoading={catalog.loading} onSelect={verse => stream.enter(page, verse, true)}
            onReady={result => setLoaded({ key: activeKey, data: result })} />
        })}
      </div>
    </div>
  )
}

function InterlinearChapter({ book, chapter, effective, stack, labels, parses, active, before,
  chapterNumbers, verseNumbers, selected, catalogLoading, onSelect, onReady }: {
  book: string; chapter: number; effective: string; stack: string[]; labels: Record<string, string>; parses: boolean
  active: boolean; before: boolean; chapterNumbers: boolean; verseNumbers: boolean
  selected: { book: string; chapter: number; verse: number } | null; catalogLoading: boolean
  onSelect: (verse: number) => void; onReady: (data: InterlinearContent) => void
}) {
  const swete = effective === 'LXX'
  const testament = BOOK_BY_ID[book]?.testament
  const { data, loading, error } = useInterlinear(book, chapter, effective, stack, parses && !swete)
  useLayoutEffect(() => {
    if (active && data) onReady(data)
  }, [data, active, parses])
  return <section data-flow-chapter={chapterKey({ book, chapter })} data-flow-active={active || undefined}
        data-flow-before={before || undefined} className="max-w-5xl mx-auto px-8 py-4">
        <div aria-hidden="true" className="mb-4 border-t border-line pt-3 text-sm text-muted">
          {BOOK_BY_ID[book]?.name ?? book}{chapterNumbers && ` ${chapter}`}
        </div>
        {data && effective === 'MT' && data.masoreticAttestationAvailable === false && (
          <p className="text-xs text-muted mb-3">This database has no word-by-word Masoretic source codes.</p>
        )}
        {data && testament === 'NT' && data.uncertainOrderVerses === undefined && (
          <p className="text-xs text-muted mb-3">This database has no verse-level checks for Greek word order.</p>
        )}
        {selected && data?.verses.length && !data.verses.some(v => v.verse === selected.verse) ? (
          <p className="text-sm text-muted mb-4" role="status">No verse text is recorded for {BOOK_BY_ID[selected.book]?.name} {selected.chapter}:{selected.verse} in {effective}.</p>
        ) : null}
        {catalogLoading || loading ? (
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
          <PassageKeyboard aria-label={`${BOOK_BY_ID[book]?.name ?? book} ${chapter} · ${effective} interlinear`} dir={data.direction}>{data.verses.map((v) => (
            <Fragment key={v.verse}>
              {data.uncertainOrderVerses?.includes(v.verse) && <p className="text-xs text-muted mb-1">
                Verse {v.verse} · The word order in this reading could not be verified.
              </p>}
              <InterlinearVerse
                v={{ verse: v.verse, text: '', tokens: v.tokens }}
                onSelectVerse={() => onSelect(v.verse)}
                verseNumbers={verseNumbers}
                rtl={data.direction === 'rtl'}
                stack={stack.filter(id => v.tokens.some(t => t.aligned?.[id]))}
                labels={labels}
                lines={v.lines}
                showParses={parses}
                swete={swete}
                sourceIssue={v.sourceIssue}
              />
            </Fragment>
          ))}</PassageKeyboard>
        )}
      </section>
}
