import { useCallback, useState } from 'react'
import type { StrongsEntry } from '@shared/types'
import { useStrongs } from '@/hooks/useStrongs'
import ResultPages from './ResultPages'
import { CONCORDANCE_PAGE_SIZE, useConcordance } from '@/hooks/useConcordance'
import { useLexicons } from '@/hooks/useLexicons'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { useAppStore, type SelectedOccurrence } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { isDivineNameId } from '@shared/lexiconId'
import { termEnabled } from '@shared/sourceWords'
import { HashIcon } from './icons'
import StrongsText from './StrongsText'
import Snippet from './Snippet'
import WordFrequency, { useFrequencySettings } from './WordFrequency'
import OriginalVerseComparison from './OriginalVerseComparison'

export default function LexiconCard({ id, inWords = false }: { id: string | null; inWords?: boolean }): JSX.Element {
  const { entry, loading, error, retry } = useStrongs(id)
  const occurrence = useAppStore(s => s.selectedStrongs === id ? s.selectedOccurrence : null)
  const [section, setSection] = useState('Definition')
  const frequencySettings = useFrequencySettings()

  if (!id) {
    return (
      <div className="mt-10 flex flex-col items-center text-center text-muted">
        <HashIcon className="w-8 h-8 text-faint mb-3" />
        <p className="text-sm max-w-[16rem] leading-relaxed">
          Select a linked word or Strong&rsquo;s number to see its dictionary entry and concordance.
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

  if (error || !entry) {
    return <>
      {occurrence && <Occurrence details={occurrence} />}
      {!inWords && <OriginalFormControl id={id} />}
      {error ? <p role="alert" className="text-sm text-muted">Couldn’t load {id}. {error} <button className="text-accent underline" onClick={retry}>Try again</button></p>
        : <p className="mt-3 text-sm text-muted">No lexicon entry found for {id}.</p>}
    </>
  }

  const isHeb = entry.language === 'hebrew'

  return (
    <div className="text-ink">
      <div className="flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-md bg-accent-soft text-accent text-xs font-semibold tabular-nums">
          {entry.id}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-faint">
          {entry.sourceLanguage ?? (isHeb ? 'Hebrew / Aramaic lexicon' : 'Greek')}
        </span>
      </div>

      {occurrence && <Occurrence details={occurrence} />}
      {!inWords && <OriginalFormControl id={entry.id} />}
      <div className="mt-3 text-[11px] uppercase tracking-wider text-faint">Dictionary headword</div>
      <div
        dir={isHeb ? 'rtl' : 'ltr'}
        className={`mt-1 text-4xl leading-tight text-ink ${isHeb ? 'font-hebrew' : 'font-greek'}`}
      >
        {entry.lemma}
      </div>
      <div className="mt-1 text-muted">
        <span className="italic">{entry.translit}</span>
        {entry.pronunciation && <span className="text-faint"> · {entry.pronunciation}</span>}
      </div>

      {inWords && (
        <div role="group" aria-label="Word study tools" className="flex flex-wrap gap-x-4 mt-4 border-b border-line">
          {['Definition', 'Concordance', 'Word frequency'].map((label) => (
            <button key={label} type="button" aria-pressed={section === label} onClick={() => setSection(label)}
              className={`text-sm pb-2 border-b-2 ${section === label ? 'text-ink font-semibold border-accent' : 'text-muted border-transparent hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {(!inWords || section === 'Definition') && <Lexicons entry={entry} />}
      {(!inWords || section === 'Concordance') && (
        <Concordance id={entry.id} occurrences={entry.occurrences} translation={occurrence?.translation} />
      )}
      {inWords && section === 'Word frequency' && <WordFrequency id={entry.id} settings={frequencySettings} />}
    </div>
  )
}

function OriginalFormControl({ id }: { id: string }): JSX.Element {
  const coverage = useStudyQuery(useCallback(() => window.api.getSourceWordCoverage(id), [id]))
  const restoring = useAppStore(s => s.restoreSourceWords)
  const divineName = isDivineNameId(id)
  const selected = useAppStore(s => s.sourceFormIds.includes(id) || (divineName && termEnabled(id, s.sourceWordTerms)))
  const setSourceForm = useAppStore(s => s.setSourceForm)
  const editions = coverage.data?.filter(row => row.occurrences > 0)
  const active = restoring && selected

  return <section className="mt-3" aria-label="Restore in reader">
    <label className="flex items-start gap-2 text-sm text-ink">
      <input type="checkbox" className="mt-1 accent-accent" checked={active}
        disabled={!active && !editions?.length} onChange={e => setSourceForm(id, e.target.checked)} />
      {divineName ? 'Show YHWH at verified occurrences' : 'Show this word’s source form at each verified occurrence'}
    </label>
    <div className="mt-1 text-xs text-muted" role="status">
      {coverage.loading ? 'Checking source records…' : coverage.error ? <>
        Source records unavailable. <button className="text-accent underline" onClick={coverage.retry}>Try again</button>
      </> : editions?.length ? <>
        Verified occurrences · {editions.map(row => `${row.translation} ${row.occurrences.toLocaleString()}`).join(' · ')}
        {!divineName && <p>The reader keeps the published wording alongside the form when needed.</p>}
      </> : 'No verified source forms are available for this word.'}
    </div>
  </section>
}

function Occurrence({ details }: { details: SelectedOccurrence }): JSX.Element {
  const { translation, book, chapter, verse, surface, sourceWord } = details
  const ref = `${BOOK_BY_ID[book]?.name ?? book} ${chapter}:${verse}`
  const rtl = sourceWord?.language === 'Hebrew' || sourceWord?.language === 'Aramaic'
  return (
    <section className="mt-3 border-b border-line pb-3" aria-label="Selected word">
      <div className="text-xs text-muted">{translation} · {ref}</div>
      <p className="mt-1 text-ink">{surface}</p>
      {sourceWord ? (
        <>
          <div className="mt-2 text-xs text-muted">{sourceWord.language} form in the Berean source for this verse</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <bdi dir={rtl ? 'rtl' : 'ltr'} lang={sourceWord.language === 'Greek' ? 'grc' : sourceWord.language === 'Aramaic' ? 'arc' : 'he'}
              className={`text-2xl ${rtl ? 'font-hebrew' : 'font-greek'}`}>{sourceWord.text}</bdi>
            <span className="text-sm text-muted">Publisher transliteration · <i>{sourceWord.translit}</i></span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Berean translation table ({sourceWord.edition})
            {' · '}{BOOK_BY_ID[sourceWord.book]?.name ?? sourceWord.book} {sourceWord.chapter}:{sourceWord.verse} · row {sourceWord.rowId}
          </p>
          {sourceWord.evidence === 'corroborated' && <p className="mt-1 text-xs text-muted">
            {isDivineNameId(sourceWord.strongs)
              ? 'The KJV tag and Masoretic text identify the four consonants יהוה.'
              : `Corroborated by the KJV word tag and the ${rtl ? 'Masoretic text' : 'Greek Textus Receptus'}.`}
          </p>}
        </>
      ) : <p className="mt-1 text-xs text-muted">{details.derived ? 'Inferred Strong’s link. ' : ''}An exact source form is unavailable for this selection.</p>}
      <OriginalVerseComparison book={book} chapter={chapter} verse={verse} translation={translation} />
    </section>
  )
}

/** Tabbed lexicon panel: Strong's plus the scholarly lexicons that apply to this word. */
function Lexicons({ entry }: { entry: StrongsEntry }): JSX.Element {
  const { groups, loading, error, retry } = useLexicons(entry.id)
  const [tab, setTab] = useState<string>('strongs')
  const isHeb = entry.language === 'hebrew'

  const hasStrongs = entry.lexiconSource !== 'STEP'
  const active = groups.some((g) => g.lexicon === tab) ? tab : hasStrongs ? 'strongs' : groups[0]?.lexicon
  const tabBtn = (on: boolean): string =>
    `px-2 py-1 text-xs rounded-md border transition-colors ${
      on ? 'bg-accent-soft text-accent border-accent/40' : 'border-line text-muted hover:bg-elevated'
    }`

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[11px] uppercase tracking-wider text-faint mr-1">Lexicons</span>
        {hasStrongs && <button onClick={() => setTab('strongs')} className={tabBtn(active === 'strongs')}>
          Strong&rsquo;s
        </button>}
        {groups.map((g) => (
          <button
            key={g.lexicon}
            onClick={() => setTab(g.lexicon)}
            className={tabBtn(active === g.lexicon)}
            title={g.basedOn}
          >
            {g.name}
          </button>
        ))}
        {loading && <span className="text-[11px] text-faint">…</span>}
      </div>

      {error && <p role="alert" className="text-sm text-muted">Couldn’t load the scholarly lexicons. {error} <button onClick={retry} className="text-accent underline">Try again</button></p>}
      {!loading && !error && !active && <p className="text-sm text-muted">No scholarly definition is available for {entry.id}.</p>}
      {active === 'strongs' ? (
        <div className="space-y-3">
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
      ) : (
        groups
          .filter((g) => g.lexicon === active)
          .map((g) => (
            <div key={g.lexicon}>
              <div className="text-[11px] text-faint mb-1.5">{g.basedOn}</div>
              <div className="space-y-3">
                {g.entries.map((e, i) => (
                  <div key={e.extKey ?? i}>
                    {(e.headword || e.gloss) && (
                      <div className="mb-0.5">
                        <span className={`text-ink ${isHeb ? 'font-hebrew' : 'font-greek'}`} dir={isHeb ? 'rtl' : 'ltr'}>
                          {e.headword}
                        </span>
                        {e.gloss && <span className="text-muted text-sm"> — {e.gloss}</span>}
                      </div>
                    )}
                    <LexBody body={e.body} />
                  </div>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  )
}

/** Render a build-time-sanitised lexicon body (only <b>/<i> tags + newlines survive). */
function LexBody({ body }: { body: string }): JSX.Element {
  const html = body.replace(/\n/g, '<br/>')
  return (
    <div
      className="text-sm text-ink leading-relaxed [&_b]:font-semibold [&_i]:italic"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function Concordance({ id, occurrences, translation }: { id: string; occurrences: number; translation?: string }): JSX.Element {
  // Follow the translation being read, so an ASV reader sees ASV verses rather than none.
  const primary = useAppStore((s) => s.primary)
  const { data, loading, error, retry, offset, setOffset } = useConcordance(id, translation ?? primary)
  const openSearchHit = useAppStore((s) => s.openSearchHit)

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-faint">Concordance</span>
        <span className="text-xs text-muted tabular-nums">
          {data
            ? `${data.total.toLocaleString()} verses`
            : `${occurrences.toLocaleString()} occurrences`}{' '}
          · {data?.translation ?? 'KJV'}
          {data?.derived && (
            <span className="italic text-faint" title="Found via inferred word mappings, not scholarly tagging">
              {' '}
              (inferred)
            </span>
          )}
        </span>
      </div>

      {data && <ResultPages offset={offset} size={CONCORDANCE_PAGE_SIZE} count={data.hits.length} total={data.total} onPage={setOffset} />}
      {error ? <p role="alert">{error} <button onClick={retry}>Try again</button></p> : loading ? (
        <p className="text-sm text-muted">Loading occurrences…</p>
      ) : data && data.hits.length > 0 ? (
        <>
          <ul className="space-y-0.5">
            {data.hits.map((h) => (
              <li key={`${h.book}-${h.chapter}-${h.verse}`}>
                <button
                  onClick={() => openSearchHit({ ...h, translation: data.translation })}
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
