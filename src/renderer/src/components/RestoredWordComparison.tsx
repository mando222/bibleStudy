import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BOOK_BY_ID } from '@shared/books'
import { mapPassage } from '@shared/passageMapping'
import { restoredVerseSegments } from '@shared/sourceWords'
import type { SourceWord, Translation, Verse } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import ComparisonSourceDetails from './ComparisonSourceDetails'

interface Target {
  anchor: HTMLElement
  source: SourceWord
  translation: string
  display: string
  alongside: boolean
}
interface ComparisonControls {
  show: (target: Target, mode: 'hover' | 'focus' | 'explore') => void
  leave: (next: EventTarget | null) => void
  dismiss: () => void
}
const Controls = createContext<ComparisonControls | null>(null)
export const useWordComparison = () => useContext(Controls)

export function WordComparisonProvider({ children, location }: { children: ReactNode; location: string }) {
  const [target, setTarget] = useState<Target | null>(null)
  const panel = useRef<HTMLElement>(null)
  const timer = useRef<number>()
  const explore = useRef(false)
  const id = useId()
  const restoring = useAppStore(s => s.restoreSourceWords)
  const terms = useAppStore(s => s.sourceWordTerms)
  const sourceFormIds = useAppStore(s => s.sourceFormIds)
  const cancelTimer = useCallback(() => window.clearTimeout(timer.current), [])
  const dismiss = useCallback(() => {
    cancelTimer()
    explore.current = false
    setTarget(null)
  }, [cancelTimer])
  const controls = useMemo<ComparisonControls>(() => ({
    dismiss,
    show(word, mode) {
      cancelTimer()
      const open = () => {
        if (!word.anchor.isConnected || word.anchor.dataset.sourceRow !== word.source.language + ':' + word.source.rowId ||
            !word.anchor.hasAttribute('data-restored-word') || window.getSelection()?.isCollapsed === false) return
        explore.current = mode === 'explore'
        setTarget(word)
      }
      if (mode === 'hover') timer.current = window.setTimeout(open, 350)
      else open()
    },
    leave(next) {
      cancelTimer()
      if (next instanceof Node && panel.current?.contains(next)) return
      timer.current = window.setTimeout(dismiss, 180)
    }
  }), [cancelTimer, dismiss])

  useEffect(() => { dismiss(); return cancelTimer }, [location, restoring, terms, sourceFormIds, dismiss, cancelTimer])
  useLayoutEffect(() => {
    if (!target || !panel.current) return
    target.anchor.setAttribute('aria-controls', id)
    if (explore.current) panel.current.focus({ preventScroll: true })
    return () => target.anchor.removeAttribute('aria-controls')
  }, [target, id])

  const closeFromPanel = useCallback(() => {
    if (panel.current?.contains(document.activeElement)) target?.anchor.focus({ preventScroll: true })
    dismiss()
  }, [target, dismiss])

  useEffect(() => {
    if (!target) return
    const outside = (e: Event) => {
      if (e.target instanceof Node && !panel.current?.contains(e.target)) dismiss()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeFromPanel() }
    }
    const lostFocus = (e: FocusEvent) => {
      if (!(e.target instanceof Element && e.target.hasAttribute('data-restored-word'))) outside(e)
    }
    const selected = () => {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed &&
          !(panel.current?.contains(selection.anchorNode) && panel.current.contains(selection.focusNode))) dismiss()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', lostFocus)
    document.addEventListener('selectionchange', selected)
    document.addEventListener('scroll', outside, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', lostFocus)
      document.removeEventListener('selectionchange', selected)
      document.removeEventListener('scroll', outside, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [target, closeFromPanel, dismiss])

  let popup: ReactNode = null
  if (target?.anchor.isConnected && restoring) {
    const rect = target.anchor.getBoundingClientRect()
    const width = Math.min(384, window.innerWidth - 24)
    const below = window.innerHeight - rect.bottom
    const down = below >= 360 || below >= rect.top
    popup = createPortal(
      <section role="dialog" aria-label="Translation comparison" id={id} ref={panel} tabIndex={-1}
        onMouseEnter={cancelTimer}
        onMouseLeave={e => { if (e.relatedTarget !== target.anchor && !panel.current?.contains(document.activeElement)) controls.leave(e.relatedTarget) }}
        className="fixed z-50 overflow-auto overscroll-contain rounded-lg border border-line bg-panel p-4 text-ink shadow-xl"
        style={{ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
          ...(down ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
          maxHeight: Math.min(440, (down ? below : rect.top) - 16) }}>
        <ComparisonContent key={[target.translation, target.source.book, target.source.chapter, target.source.verse,
          target.source.rowId].join('/')} target={target} close={closeFromPanel} />
      </section>, document.body)
  }
  return <Controls.Provider value={controls}>{children}{popup}</Controls.Provider>
}

function ComparisonContent({ target, close }: { target: Target; close: () => void }) {
  const translations = useAppStore(s => s.translations)
  const parallels = useAppStore(s => s.parallels)
  const [expanded, setExpanded] = useState(false)
  const { source, translation, display } = target
  const choices = new Map(translations.filter(t => !t.isOriginal && t.id !== translation).map(t => [t.id, t]))
  const ordered = [...new Set([...parallels, 'BSB', 'KJV', 'ASV', 'WEB', ...choices.keys()])]
    .map(id => choices.get(id)).filter((t): t is Translation => t !== undefined)
  const book = BOOK_BY_ID[source.book]?.name ?? source.book
  const current = translations.find(t => t.id === translation)
  return <>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-serif font-semibold leading-tight"><bdi>{display}</bdi></h2>
        <p className="mt-0.5 text-xs text-muted">{book} {source.chapter}:{source.verse}</p>
      </div>
      <button type="button" aria-label="Close translation comparison" onClick={close}
        className="px-1 text-muted hover:text-ink">✕</button>
    </div>
    <dl className="mt-2 divide-y divide-line text-sm">
      <ComparisonRow edition={current} abbrev={current?.abbrev ?? translation}
        label={target.alongside ? 'Aligned wording' : 'Verified wording'} text={source.english} />
      {(expanded ? ordered : ordered.slice(0, 3)).map(edition =>
        <OtherReading key={edition.id} edition={edition} target={target} />)}
    </dl>
    {ordered.length > 3 && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
      className="mt-1 text-xs text-accent hover:underline">{expanded ? 'Fewer translations' : 'More translations'}</button>}
    <ComparisonSourceDetails source={source} translation={translation} display={display} />
    {target.alongside && <p className="mt-2 text-xs text-muted">The source record links this form to the wording above.
      The full translation stays visible because this word may account for only part of its meaning.</p>}
  </>
}

function ComparisonRow({ edition, abbrev, label, text, nativeRef }: {
  edition?: Translation; abbrev: string; label: string; text: string; nativeRef?: string
}) {
  return <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 py-2">
    <dt className="text-xs font-semibold text-ink break-words"><abbr className="no-underline" title={edition?.name}>{abbrev}</abbr></dt>
    <dd>
      <div className="text-[11px] leading-tight text-muted">{label}{nativeRef && ' · ' + nativeRef}</div>
      <p dir={edition?.direction ?? 'auto'} className="mt-0.5 font-serif leading-snug whitespace-pre-wrap">{text}</p>
    </dd>
  </div>
}

function OtherReading({ edition, target }: { edition: Translation; target: Target }) {
  const { source, translation } = target
  const reference = { book: source.book, chapter: source.chapter, verse: source.verse }
  const imported = edition.language === 'imported'
  const native = imported ? reference : mapPassage(reference, translation, edition.id)
  const book = native?.book
  const chapter = native?.chapter
  const number = native?.verse
  const [reading, setReading] = useState<Verse | null>()
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!book || chapter == null || number == null) return
    let active = true
    window.api.getComparisonVerse({ translation: edition.id, book, chapter, verse: number }).then(v => {
      if (active) setReading(v)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [edition.id, book, chapter, number])
  const moved = native && (book !== source.book || chapter !== source.chapter || number !== source.verse)
  const nativeRef = moved ? (BOOK_BY_ID[native.book]?.name ?? native.book) + ' ' + chapter + ':' + number : undefined
  const row = { edition, abbrev: edition.abbrev, nativeRef }
  if (!native) return <ComparisonRow {...row} label="Reference unavailable" text="No corresponding verse is mapped." />
  if (error) return <ComparisonRow {...row} label="Unavailable" text="Could not load this edition." />
  if (reading === undefined) return <ComparisonRow {...row} label="Loading…" text="" />
  if (!reading || reading.verse !== number) return <ComparisonRow {...row} label="Verse unavailable" text="No text at this reference in this edition." />

  const segments = restoredVerseSegments(reading, { book: native.book, chapter: native.chapter, translation: edition.id },
    true, { [source.strongs]: true }, [source.strongs])
  const matched = segments.filter(s => {
    const other = s.token?.sourceWord
    return (s.annotation || s.original !== s.display) && other?.edition === source.edition &&
      other.rowId === source.rowId && other.language === source.language && other.strongs === source.strongs &&
      other.text === source.text && other.book === source.book && other.chapter === source.chapter && other.verse === source.verse
  })
  if (matched.length === 1) return <ComparisonRow {...row}
    label={matched[0].annotation ? 'Aligned wording' : 'Verified wording'} text={matched[0].original} />
  return <ComparisonRow {...row} label={imported ? 'Same reference · imported numbering unverified' : 'Verse context · no verified word link'}
    text={reading.text} />
}
