import { Fragment, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { greekOrderNote } from '@shared/apparatus'
import type {
  WordFrequency as Frequency, WordFrequencyCounts, WordFrequencyEdition,
  WordFrequencyForm, WordFrequencyPassageQuery, WordFrequencyQuery
} from '@shared/wordFrequency'
import { frequencyEditionNames as editionNames } from '@shared/wordFrequency'
import { describeFrequencyMorph } from '@shared/frequencyMorphology'
import type { NtText } from '@shared/textPreference'
import { BOOK_BY_ID } from '@shared/books'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { useAppStore } from '@/store/useAppStore'
import { FrequencyLegend, frequencyScale, FrequencyTiles, quantity, type FrequencyMetric } from './WordFrequencyMap'

const selectStyle = 'min-w-0 max-w-full rounded border border-line bg-elevated px-2 py-1 text-sm text-ink'
const labelStyle = 'flex min-w-0 flex-col items-start gap-1 text-xs text-muted'

function QueryError({ error, retry }: { error: string; retry: () => void }) {
  return <p role="alert" className="text-sm text-muted">Couldn’t load these results. {error} <button onClick={retry} className="text-accent underline">Try again</button></p>
}

/** Keep display choices while another Words entry loads or the reader opens its definition. */
export function useFrequencySettings() {
  const [metric, setMetric] = useState<FrequencyMetric>('rate')
  const [place, setPlace] = useState<{ book?: string; chapter?: number }>({})
  return { metric, setMetric, place, setPlace }
}

type MapSettings = ReturnType<typeof useFrequencySettings>

const studyWords = [
  { topic: 'Love', entries: [
    ['G26', 'ἀγάπη · love (noun)'], ['G25', 'ἀγαπάω · to love'], ['G5368', 'φιλέω · to love, to show affection'],
    ['H160', 'אַהֲבָה · love (noun)'], ['H157', 'אָהַב · to love']
  ] },
  { topic: 'Husband and wife', entries: [
    ['G435', 'ἀνήρ · man, husband'], ['G1135', 'γυνή · woman, wife'],
    ['H376', 'אִישׁ · man, husband'], ['H802', 'אִשָּׁה · woman, wife'], ['H1167', 'בַּעַל · owner, master, husband']
  ] },
  { topic: 'Marriage and weddings', entries: [
    ['G1062', 'γάμος · marriage, wedding'], ['G1060', 'γαμέω · to marry'],
    ['H2861', 'חֲתֻנָּה · wedding'], ['H1166', 'בָּעַל · to marry, to rule over']
  ] }
]

export default function WordFrequency({ id, settings, chooseWord }: {
  id: string; settings: MapSettings; chooseWord?: (id: string) => void
}): JSX.Element {
  const wordHelp = useId()
  const greekChoice = useAppStore(s => s.frequencyGreekEdition)
  const setGreekChoice = useAppStore(s => s.setFrequencyGreekEdition)
  const order = useAppStore(s => s.preferredTextOrder.nt)
  const available = useAppStore(s => s.originalEditions)
  const greekEditions = available ? order.filter(id => available.some(edition => edition.id === id)) : order
  const selected = greekChoice && greekEditions.includes(greekChoice) ? greekChoice : ''
  const isMT = id.startsWith('H')
  const edition = isMT ? 'MT' : selected || greekEditions[0]
  return (
    <section aria-label="Word frequency" className="mt-4 space-y-3">
      {chooseWord && <label className={labelStyle}>Word to map
        <select aria-label="Word to map" aria-describedby={wordHelp} className={selectStyle} value={id} onChange={e => chooseWord(e.target.value)}>
          {!studyWords.some(group => group.entries.some(([entry]) => entry === id)) && <option value={id}>{id} · Current entry</option>}
          {studyWords.map(group => <optgroup key={group.topic} label={group.topic}>
            {group.entries.map(([entry, meaning]) => <option value={entry} key={entry}>{entry} · {meaning}</option>)}
          </optgroup>)}
        </select>
        <span id={wordHelp}>Choose an entry here or in the Words directory. The map counts all indexed uses of that original word across its meanings.</span>
      </label>}
      <label className={labelStyle}>Source edition
        {isMT ? <span className="text-sm text-ink">{editionNames.MT}</span> : edition ? (
          <select className={selectStyle} value={selected} onChange={e => setGreekChoice(e.target.value as NtText | '')}>
            <option value="">Use global setting · {editionNames[greekEditions[0]]}</option>
            {greekEditions.map(ed => <option key={ed} value={ed}>{editionNames[ed]}</option>)}
          </select>
        ) : <span>No Greek source edition is available.</span>}
      </label>
      {edition && <EditionFrequency key={`${id}:${edition}`} id={id} edition={edition} settings={settings} />}
    </section>
  )
}

function formLabel(f: WordFrequencyForm): string {
  // Isolate the source spelling so RTL text and its count stay in reading order inside the select.
  return [`\u2068${f.text}\u2069`, f.translit, f.morph ? describeFrequencyMorph(f.morph) : 'Parse unavailable',
    quantity(f.count, 'occurrence')].filter(Boolean).join(' · ')
}

function EditionFrequency({ id, edition, settings }: WordFrequencyQuery & { settings: MapSettings }): JSX.Element {
  const formHelp = useId()
  const [form, setForm] = useState<string | null>(null)
  const load = useCallback(() => window.api.getWordFrequency({ id, edition }), [id, edition])
  const all = useStudyQuery(load)
  const loadForm = useCallback(() => window.api.getWordFrequency({ id, edition, form }), [id, edition, form])
  const filtered = useStudyQuery(loadForm, form !== null)
  const result = form ? filtered : all
  const data = result.data
  return (
    <>
      {!!all.data?.forms.length && (
        <label className={labelStyle}>Grammatical form
          <select aria-label="Grammatical form" aria-describedby={formHelp} className={selectStyle} value={form ?? ''} onChange={e => setForm(e.target.value || null)}>
            <option value="">All forms ({all.data.forms.length.toLocaleString()})</option>
            {all.data.forms.map(f => <option key={f.id} value={f.id} title={f.morph}>{formLabel(f)}</option>)}
          </select>
          <span id={formHelp}>Choose one spelling and grammatical form to narrow the map, or choose All forms to include them all.</span>
        </label>
      )}
      {all.data && all.data.coverage !== 'unavailable' && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer w-fit">How uses are counted</summary>
          <p className="mt-1 max-w-prose leading-relaxed">
            {edition === 'MT'
              ? 'This map follows the Leningrad text and the Qere readings recorded by STEPBible’s TAHOT. '
              : 'STEPBible’s TAGNT identifies the Greek readings for this edition. '}
            Each recorded link to this entry counts once, including repeated uses in a verse.
            The rate uses tagged written words in the relevant language. Verse labels follow the source edition.
          </p>
        </details>
      )}
      {result.error ? <QueryError error={result.error} retry={result.retry} /> : !data ? (
        <p role="status" className="text-sm text-muted">Loading word frequency…</p>
      ) : (
        <>
          {data.notice && <p role="note" className="rounded border-l-2 border-accent bg-accent-soft px-3 py-2 text-sm text-ink">{data.notice}</p>}
          {data.coverage === 'unavailable' ? (
            !data.notice && <p className="text-sm text-muted">Frequency data is unavailable for this source edition.</p>
          ) : (
            <FrequencyResults data={data} form={form} settings={settings} />
          )}
        </>
      )}
    </>
  )
}

function mostFrequent<T extends WordFrequencyCounts>(units: T[]): T | undefined {
  return units.filter(unit => unit.tagged > 0).reduce<T | undefined>(
    (best, unit) => !best || unit.occurrences > best.occurrences ? unit : best, undefined)
}

function FrequencyResults({ data, form, settings }: { data: Frequency; form: string | null; settings: MapSettings }): JSX.Element {
  const { metric, setMetric, place, setPlace } = settings
  const scale = useMemo(() => frequencyScale(data.books, metric), [data.books, metric])
  const selectedBook = data.books.find(b => b.book === place.book)
  const book = selectedBook ?? mostFrequent(data.books)
  const chapter = selectedBook?.chapters.find(c => c.chapter === place.chapter) ?? mostFrequent(book?.chapters ?? [])
  // Keep the passage the reader sees even when a word, form, or edition changes its counts.
  useEffect(() => {
    if (book && chapter && (place.book !== book.book || place.chapter !== chapter.chapter))
      setPlace({ book: book.book, chapter: chapter.chapter })
  }, [book, chapter, place, setPlace])
  const withMatches = data.books.filter(b => b.occurrences > 0).length
  const coveredBooks = data.books.filter(b => b.tagged > 0).length
  const denominator = data.language === 'Hebrew / Aramaic' ? 'Hebrew and Aramaic words' : `${data.language} words`
  const partial = data.coverage === 'partial'
  return (
    <>
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <strong className="text-lg font-semibold">{partial && !data.occurrences ? 'No confirmed occurrences' : quantity(data.occurrences, partial ? 'confirmed occurrence' : 'occurrence')}</strong>
        <span className="text-sm text-muted">{quantity(data.verses, 'verse')} · {withMatches} of {quantity(coveredBooks, 'indexed book')}</span>
      </p>
      {data.alternateOccurrences > 0 && (
        <p className="text-xs text-muted">For {quantity(data.alternateOccurrences, 'occurrence')}, STEPBible lists this entry as an alternate identification.</p>
      )}
      {(!!data.occurrences || !partial) && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-serif text-lg">Books</h3>
            <label className="flex items-center gap-2 text-xs text-muted">Shade by
              <select value={metric} onChange={e => setMetric(e.target.value as FrequencyMetric)} className={selectStyle}>
                <option value="rate">Uses per 1,000 tagged words</option>
                <option value="count">Total occurrences</option>
              </select>
            </label>
          </div>
          <FrequencyLegend metric={metric} scale={scale} denominator={denominator}
            hasUncovered={coveredBooks < data.books.length || !!book?.chapters.some(c => c.tagged === 0)} />
          <FrequencyTiles label="Books in canonical order" metric={metric} scale={scale} active={book?.book} denominator={denominator}
            tiles={data.books.map(b => ({ id: b.book, name: b.name, label: b.book.replace(/^(\d)/, '$1 '), counts: b }))}
            onSelect={tile => setPlace({ book: String(tile.id) })} />
          {book && (
            <section className="border-t border-line pt-3">
              <h3 className="mb-2 font-serif text-lg">{book.name}</h3>
              <FrequencyTiles key={book.book} compact label={`${book.name} chapters`} metric={metric} scale={scale} active={chapter?.chapter}
                denominator={denominator} tiles={book.chapters.map(c => ({
                  id: c.chapter, name: `${book.name} ${c.chapter}`, label: `Ch. ${c.chapter}`, counts: c
                }))}
                onSelect={tile => setPlace({ book: book.book, chapter: Number(tile.id) })} />
              {chapter && (
                <section className="mt-4">
                  <h4 className="font-serif text-base">{book.name} {chapter.chapter} {chapter.tagged > 0 && <span className="text-sm font-sans text-muted">· {quantity(chapter.occurrences, 'occurrence')} in {quantity(chapter.verses, 'verse')}</span>}</h4>
                  {chapter.occurrences > 0 ? <FrequencyPassages id={data.id} edition={data.edition} form={form} book={book.book} chapter={chapter.chapter} /> :
                    <p className="mt-1 text-sm text-muted">{chapter.tagged ? 'No occurrences recorded in this chapter.' : 'No tagged words in this scope.'}</p>}
                </section>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}

function FrequencyPassages({ id, edition, form, book, chapter }: WordFrequencyPassageQuery): JSX.Element {
  const load = useCallback(() => window.api.getWordFrequencyPassages({ id, edition, form, book, chapter }), [id, edition, form, book, chapter])
  const { data: verses, error, retry } = useStudyQuery(load)
  const openSearchHit = useAppStore(s => s.openSearchHit)
  if (error) return <QueryError error={error} retry={retry} />
  if (!verses) return <p role="status" className="text-sm text-muted">Loading passages…</p>
  if (!verses.length) return <p className="text-sm text-muted">Passage text unavailable.</p>
  const isMT = edition === 'MT'
  return (
    <ol aria-label="Matching verses" className="mt-1 divide-y divide-line">
      {verses.map(v => {
        const ref = `${BOOK_BY_ID[v.book]?.name ?? v.book} ${v.chapter}:${v.verse}`
        const target = v.readerRef
        const readerLabel = target && `${BOOK_BY_ID[target.book]?.name ?? target.book} ${target.chapter}:${target.verse}`
        const different = readerLabel && readerLabel !== ref
        return (
          <li key={v.verse} className="py-2">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              {target ? <button className="font-semibold text-accent hover:underline" type="button"
                title={`Open ${readerLabel} in the ${edition} interlinear`}
                aria-label={`Open ${ref} in the interlinear${different ? ` at ${readerLabel}` : ''}`}
                onClick={() => openSearchHit({ ...target, translation: edition, edition, bookName: BOOK_BY_ID[target.book]?.name ?? target.book, snippet: '' })}>
                {ref}
              </button> : <span className="font-semibold text-ink">{ref}</span>}
              <span>{quantity(v.occurrences, 'occurrence')}</span>
              {different && <span>Reader {readerLabel}</span>}
            </div>
            {v.orderStatus && <p className="text-xs text-muted">{greekOrderNote[v.orderStatus]}</p>}
            <p data-study-scripture="" dir={isMT ? 'rtl' : 'ltr'} lang={isMT ? undefined : 'grc'}
              className={`mt-1 text-lg leading-relaxed ${isMT ? 'font-hebrew' : 'font-greek'}`}>
              {v.tokens.map((token, i) => (
                <Fragment key={i}>{token.spaceBefore && ' '}{token.matching ? <mark className="rounded-sm bg-accent-soft text-ink font-semibold underline decoration-accent underline-offset-4">{token.text}</mark> : token.text}</Fragment>
              ))}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
