import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BOOK_BY_ID } from '@shared/books'
import { matchingBooks, passageLabel, type ScripturePassage } from '@shared/refs'
import { usePassageCatalog } from '@/hooks/usePassageCatalog'
import { useStudyQuery } from '@/hooks/useStudyQuery'
import { openPassage, readerPassage } from '@/lib/openPassage'
import { readerChapter } from '@/lib/passage'
import { readingEdition, useAppStore } from '@/store/useAppStore'
import './PassagePicker.css'

type Step = 'books' | 'chapters' | 'verses'
type Endpoint = { chapter: number; verse: number }
type Option = { value: string | number; label?: string; disabled?: boolean; current?: boolean }

function currentLocation() {
  const s = useAppStore.getState()
  return readerChapter(s.book, s.chapter, s.activeVerse, s.referenceEdition || s.primary, readingEdition(s))
}

function useVerseNumbers(edition: string, book: string, chapter: number, interlinear: boolean, enabled: boolean) {
  const load = useCallback(() => window.api.listReadingVerses({ translation: edition, book, chapter }, interlinear),
    [edition, book, chapter, interlinear])
  return useStudyQuery(load, enabled)
}

/** Tab visits the choices once. Arrow keys follow the visible rows and columns. */
function ChoiceGrid({ options, names, prefix = '', label, choose }: {
  options: Option[]
  names?: boolean
  prefix?: string
  label: string
  choose: (value: string | number) => void
}) {
  const [lastFocus, setLastFocus] = useState<string | number | null>(null)
  const enabled = options.filter(o => !o.disabled)
  const entry = enabled.find(o => o.value === lastFocus) ?? enabled.find(o => o.current) ?? enabled[0]
  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index === -1) return
    const width = buttons.filter(b => b.offsetTop === buttons[0].offsetTop).length
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -width, ArrowDown: width }
    let next = index
    if (event.key === 'Home') next = buttons.findIndex(b => !b.disabled)
    else if (event.key === 'End') next = buttons.length - 1 - [...buttons].reverse().findIndex(b => !b.disabled)
    else if (event.key in delta) {
      next += delta[event.key]
      while (buttons[next]?.disabled) next += delta[event.key]
    } else return
    event.preventDefault()
    buttons[next]?.focus()
  }
  return <div role="group" aria-label={label} className={'passage-picker-grid' + (names ? ' book-grid' : '')} onKeyDown={move}>
    {options.map(option => <button type="button" key={option.value} disabled={option.disabled}
      aria-label={prefix ? prefix + ' ' + option.value : undefined}
      aria-current={option.current ? 'location' : undefined}
      tabIndex={option.value === entry?.value ? 0 : -1}
      onFocus={() => setLastFocus(option.value)} onClick={() => choose(option.value)}>
      {option.label ?? option.value}
    </button>)}
  </div>
}

export default function PassagePicker({ onClose, focusSearchOnOpen = false }: { onClose: () => void; focusSearchOnOpen?: boolean }) {
  const [current] = useState(currentLocation)
  const [book, setBook] = useState(current?.book ?? useAppStore.getState().book)
  const [chapter, setChapter] = useState(current?.chapter ?? 1)
  const [step, setStep] = useState<Step>(current ? 'verses' : 'books')
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusSearchOnOpen) searchInput.current?.focus({ preventScroll: true })
  }, [focusSearchOnOpen])
  const [range, setRange] = useState(false)
  const [start, setStart] = useState<Endpoint | null>(null)
  const [message, setMessage] = useState('')
  const [opening, setOpening] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const focusChoices = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  const inputId = useId()
  const interlinear = useAppStore(s => s.interlinear)
  const chronological = useAppStore(s => s.chronological)
  const toggleOrder = useAppStore(s => s.toggleChronological)
  const edition = useAppStore(s => readingEdition(s, book))
  const catalog = usePassageCatalog()
  const books = useMemo(() => {
    const grouped = new Map<string, number[]>()
    for (const row of catalog.data ?? []) {
      const chapters = grouped.get(row.book)
      if (chapters) chapters.push(row.chapter)
      else grouped.set(row.book, [row.chapter])
    }
    return grouped
  }, [catalog.data])
  const chapters = books.get(book) ?? []
  const browsing: Step = !books.has(book) ? 'books' : step === 'verses' && !chapters.includes(chapter) ? 'chapters' : step
  const search = query.trim()
  const typed = readerPassage(query)
  const candidates = search && !typed ? matchingBooks(query).filter(id => books.has(id)) : []
  const first = typed?.chapter ?? chapter
  const last = typed?.lastChapter ?? first
  const checkingBook = typed?.book ?? book
  const checkingEdition = typed?.edition ?? edition
  const availableChapters = books.get(checkingBook)
  const hasFirst = !!availableChapters?.includes(first)
  const hasLast = !!availableChapters?.includes(last)
  const firstVerses = useVerseNumbers(checkingEdition, checkingBook, first, interlinear,
    hasFirst && (typed ? typed.firstVerse != null : !search && browsing === 'verses'))
  const lastVerses = useVerseNumbers(checkingEdition, checkingBook, last, interlinear,
    !!typed && hasLast && last !== first && typed.lastVerse != null)
  const endingVerses = last === first ? firstVerses.data : lastVerses.data
  const invalidRef = typed && catalog.data && (!hasFirst || !hasLast ||
    (typed.firstVerse != null && firstVerses.data && !firstVerses.data.includes(typed.firstVerse)) ||
    (typed.lastVerse != null && endingVerses && !endingVerses.includes(typed.lastVerse)))
  const lookupError = catalog.error ? catalog : firstVerses.error ? firstVerses : lastVerses.error ? lastVerses : null
  const checking = catalog.loading || firstVerses.loading || lastVerses.loading
  const name = BOOK_BY_ID[book]?.name ?? book
  const title = search ? (typed ? 'Matching passage' : 'Matching books') :
    browsing === 'books' ? 'Choose a book' : browsing === 'chapters' ? (start ? 'Choose the ending chapter' : 'Choose a chapter') :
      !range ? 'Choose a verse' : start ? 'Choose the last verse' : 'Choose the first verse'

  // A pending open may outlive its sheet if the user dismisses it while the database is loading.
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (focusChoices.current && heading.current) {
      heading.current.focus()
      focusChoices.current = false
    }
  }, [search, step, range, start, chapter, book])

  function goToStep(next: Step) {
    focusChoices.current = true
    setMessage('')
    setStep(next)
  }
  function chooseBook(id: string) {
    const available = books.get(id)
    if (!available?.length) return
    setQuery('')
    setBook(id)
    setChapter(available[0])
    setRange(false)
    setStart(null)
    goToStep(available.length === 1 ? 'verses' : 'chapters')
  }
  async function open(ref: ScripturePassage, source = edition) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setOpening(true)
    setMessage('')
    try {
      await openPassage(ref, source, controller.signal)
      if (!controller.signal.aborted) onClose()
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not open this passage.')
    } finally {
      if (!controller.signal.aborted) setOpening(false)
      pending.current = null
    }
  }
  function chooseVerse(verse: number) {
    if (range && !start) {
      focusChoices.current = true
      setStart({ chapter, verse })
    } else {
      void open({ book, chapter: start?.chapter ?? chapter, firstVerse: start?.verse ?? verse, lastChapter: chapter, lastVerse: verse })
    }
  }
  function submitSearch() {
    if (typed) {
      if (!invalidRef && !lookupError) void open(typed, typed.edition)
    } else if (candidates.length === 1) chooseBook(candidates[0])
    else if (candidates.length) setMessage('Choose a book below.')
    else setMessage('Enter a book or reference, such as John 3:16.')
  }
  const bookOptions = (ids: string[]): Option[] => ids.map(id => ({ value: id, label: BOOK_BY_ID[id].name, current: id === current?.book }))
  function choices() {
    if (lookupError) return <div role="alert">{lookupError.error} <button type="button" onClick={lookupError.retry}>Retry</button></div>
    if (checking) return <p role="status">Loading passage choices…</p>
    if (search) {
      if (typed) return invalidRef ? <p role="status">{passageLabel(typed)} is unavailable in {checkingEdition}.</p> :
        <button type="submit" form={formId} className="passage-picker-open">Open {passageLabel(typed)}</button>
      if (!candidates.length) return <p role="status">Type a book name or a reference with its chapter and verse.</p>
      return <ChoiceGrid names label="Matching books" options={bookOptions(candidates)} choose={id => chooseBook(String(id))} />
    }
    if (browsing === 'books') {
      if (!books.size) return <p role="status">No recorded chapters are available in the selected edition.</p>
      return <ChoiceGrid names label="Available books" options={bookOptions([...books.keys()])} choose={id => chooseBook(String(id))} />
    }
    if (browsing === 'chapters') return <ChoiceGrid label="Available chapters" prefix="Chapter"
      options={chapters.map(c => ({ value: c, current: current?.book === book && current.chapter === c, disabled: !!start && c < start.chapter }))}
      choose={c => { setChapter(Number(c)); goToStep('verses') }} />

    return <>
      <div className="passage-picker-actions">
        {!range && <button type="button" onClick={() => void open({ book, chapter, lastChapter: chapter })}>Read whole chapter</button>}
        <button type="button" onClick={() => { focusChoices.current = true; setRange(!range); setStart(null); setMessage('') }}>
          {range ? 'Cancel range' : 'Select range'}
        </button>
        {start && chapters.some(c => c > start.chapter) && <button type="button" onClick={() => goToStep('chapters')}>End in another chapter</button>}
      </div>
      <ChoiceGrid label="Available verses" prefix="Verse" options={(firstVerses.data ?? []).map(v => ({
        value: v,
        current: start ? chapter === start.chapter && v === start.verse :
          current?.book === book && current.chapter === chapter && 'verse' in current && current.verse === v,
        disabled: !!start && chapter === start.chapter && v < start.verse
      }))} choose={n => chooseVerse(Number(n))} />
    </>
  }

  return <fieldset disabled={opening} aria-label="Passage selection" className="passage-picker">
    <form id={formId} onSubmit={e => { e.preventDefault(); if (search) submitSearch() }}>
      <div className="passage-picker-label"><label htmlFor={inputId}>Book or reference</label><span>{checkingEdition}</span></div>
      <input id={inputId} ref={searchInput} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
        placeholder="John 3:16 or 1 Jn 4:7–12" value={query}
        onChange={e => { setQuery(e.target.value); setMessage('') }} />
    </form>
    {!search && browsing !== 'books' && <div className="passage-picker-path">
      <button type="button" aria-label={'Change book, ' + name} onClick={() => { setRange(false); setStart(null); goToStep('books') }}>
        {name} <span aria-hidden="true">▾</span>
      </button>
      {browsing === 'verses' && <button type="button" aria-label={'Change chapter, ' + chapter} onClick={() => goToStep('chapters')}>
        Chapter {chapter} <span aria-hidden="true">▾</span>
      </button>}
    </div>}
    <div className="passage-picker-section">
      <h3 ref={heading} tabIndex={-1}>{title}</h3>
      {!search && browsing === 'books' && !!books.size && <label className="passage-picker-order">
        <input type="checkbox" checked={chronological} onChange={toggleOrder} /> Chronological order
      </label>}
    </div>
    {!search && start && <p className="passage-picker-start" role="status">From {name} {start.chapter}:{start.verse}</p>}
    {choices()}
    {message && <p role="alert">{message}</p>}
    {opening && <p role="status">Opening passage…</p>}
  </fieldset>
}
