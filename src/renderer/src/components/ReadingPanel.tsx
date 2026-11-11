import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { mapChapterStart, mapPassage } from '@shared/passageMapping'
import { BOOK_BY_ID } from '@shared/books'
import { useChapter } from '@/hooks/useChapter'
import { useVerseNavigation } from '@/hooks/useVerseNavigation'
import { useHighlights, useNotes } from '@/hooks/useUserData'
import { publishedCopy, publishedSelection } from '@/lib/scriptureSelection'
import VerseView from './VerseView'
import { WordComparisonProvider } from './RestoredWordComparison'
import VersePopover from './VersePopover'
import InterlinearReader from './InterlinearReader'
import { BookIcon, SparkleIcon } from './icons'
import { ReadingTools, StructuredPassages } from './ReadingTools'
import { chooseColumn, editionDisplay } from '@shared/readingDisplay'

export default function ReadingPanel(): JSX.Element {
  const parallels = useAppStore((s) => s.parallels)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const interlinear = useAppStore((s) => s.interlinear)
  const translations = useAppStore((s) => s.translations)
  const setParallels = useAppStore((s) => s.setParallels)

  const referenceEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const location = JSON.stringify([book, chapter, referenceEdition, activeVerse, parallels])
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const reader = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function copyPublished(event: ClipboardEvent): void {
      const selection = window.getSelection()
      if (!selection || !event.clipboardData || !reader.current) return
      const text = publishedCopy(reader.current, selection)
      if (text) {
        event.clipboardData.setData('text/plain', text)
        event.preventDefault()
      }
    }
    document.addEventListener('copy', copyPublished)
    return () => document.removeEventListener('copy', copyPublished)
  }, [])
  const driver = useRef<number | null>(null)
  useEffect(() => { driver.current = null }, [location])
  const [anchor, setAnchor] = useState<{ key: string; edition: string; book: string; chapter: number; verse: number } | null>(null)
  const current = anchor?.key === location ? anchor : null
  const source = current ?? { book, chapter, verse: activeVerse, edition: referenceEdition }
  const columns = parallels.map((edition) => source.verse == null
    ? mapChapterStart(source, source.edition, edition)
    : mapPassage({ ...source, verse: source.verse }, source.edition, edition))
  // Open tools in the edition the reader selected, or in the lead visible column for a navigator jump.
  const scopeEdition = parallels.includes(source.edition) ? source.edition : parallels[0]
  const scope = parallels.includes(source.edition) ? source : columns[0]

  // Align on the visible verse. Equal pixel offsets can be chapters apart in differently wrapped text.
  const onScroll = (idx: number): void => {
    const source = refs.current[idx]
    const native = columns[idx]
    if (driver.current !== idx || !source || !native || parallels.length < 2) return
    const top = source.getBoundingClientRect().top
    const first = [...source.querySelectorAll<HTMLElement>('[data-verse]')].find((el) => el.getBoundingClientRect().bottom > top)
    if (!first) return
    const verse = Number(first.dataset.verse)
    const passage = { book: native.book, chapter: native.chapter, verse }
    const offset = Math.min(0, first.getBoundingClientRect().top - top)
    const peers = parallels.map((id) => mapPassage(passage, parallels[idx], id))
    if (peers.some((peer, i) => peer?.chapter !== columns[i]?.chapter || peer?.book !== columns[i]?.book)) {
      setAnchor({ key: location, edition: parallels[idx], ...passage })
    }
    peers.forEach((peer, i) => {
      const el = refs.current[i]
      if (i === idx || !el || !peer || columns[i]?.chapter !== peer.chapter || columns[i]?.book !== peer.book) return
      const row = el.querySelector<HTMLElement>(`[data-verse="${peer.verse}"]`)
      if (row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - offset
    })
  }

  const canAdd = translations.length > parallels.length && parallels.length < 4
  const addColumn = (): void => {
    const next = translations.find((t) => !parallels.includes(t.id))?.id
    if (next) setParallels([...parallels, next])
  }

  return (
    <div ref={reader} className="h-full flex flex-col bg-bg">
      <WordComparisonProvider location={JSON.stringify([location, interlinear])}>
      {!interlinear && scope && <ReadingTools range={{ edition: scopeEdition, book: scope.book, chapter: scope.chapter,
        ...(source.verse != null && scope.verse != null ? { firstVerse: scope.verse } : {}) }}/>}
      {interlinear ? (
        <div className="flex-1 min-h-0">
          <InterlinearReader book={book} chapter={chapter} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex divide-x divide-line">
          {parallels.map((t, i) => {
            const native = columns[i]
            const header = { translation: t, index: i, canRemove: parallels.length > 1 }
            if (!native) return (
              <div key={t + i} className="flex-1 min-w-0">
                <ColumnHeader {...header} />
                <StateBlock title="No verified equivalent">A corresponding passage in {t} is unavailable.</StateBlock>
              </div>
            )
            return <Column key={t + i} {...header} book={native.book} chapter={native.chapter}
              alignTo={source.edition !== t && driver.current !== i ? native.verse : null}
              takeScrollControl={() => { driver.current = i }}
              registerRef={(el) => (refs.current[i] = el)} onScroll={() => onScroll(i)} />
          })}
          {canAdd && (
            <button
              onClick={addColumn}
              title="Add a parallel translation"
              className="w-9 shrink-0 self-stretch flex items-start justify-center pt-1.5 text-xl leading-none text-muted hover:text-accent hover:bg-elevated"
            >
              +
            </button>
          )}
        </div>
      )}
      </WordComparisonProvider>
    </div>
  )
}

// Room for the dropdown arrow the browser draws inside the select. Approximate and deliberately
// generous, so a long name never sits flush against it.
const SELECT_ARROW_PX = 26

let measureCanvas: HTMLCanvasElement | null = null
/** Rendered width of `text` at `font`, measured off-screen so it costs no layout. */
function textWidth(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return Number.POSITIVE_INFINITY
  ctx.font = font
  return ctx.measureText(text).width
}

/**
 * True when every one of `labels` fits the select at its current width.
 *
 * A native <select> renders the same text in the closed box and in the popup, and the closed box is
 * only as wide as its column — so full names are all-or-nothing. A list mixing "King James Version"
 * with "WYC" reads as a bug, and a clipped "American Standard Versi…" is worse than a clean "ASV".
 * No feedback loop: the select is flex-1/min-w-0, so its width comes from the column, not its text.
 */
function useLabelsFit(ref: React.RefObject<HTMLSelectElement | null>, labels: string[]): boolean {
  const [fits, setFits] = useState(false)
  const key = labels.join('\u0000')
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !key) {
      setFits(false)
      return
    }
    const check = (): void => {
      const s = getComputedStyle(el)
      const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      const widest = Math.max(...key.split('\u0000').map((l) => textWidth(l, font)))
      const chrome =
        parseFloat(s.paddingLeft || '0') + parseFloat(s.paddingRight || '0') + SELECT_ARROW_PX
      setFits(widest + chrome <= el.clientWidth)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, key])
  return fits
}

/** Per-column header: the translation picker for this column and its close button. */
function ColumnHeader({
  translation,
  index,
  canRemove
}: {
  translation: string
  index: number
  canRemove: boolean
}): JSX.Element {
  const translations = useAppStore((s) => s.translations)
  const parallels = useAppStore((s) => s.parallels)
  const setParallels = useAppStore((s) => s.setParallels)
  // Prefer the full name — "TNT"/"GNV"/"WYC" tell a reader nothing — but only when the column is
  // wide enough to show it whole.
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const showFullNames = useLabelsFit(
    selectRef,
    translations.map((t) => t.name)
  )
  const options = translations.length
    ? translations.map((t) => ({ id: t.id, label: showFullNames ? t.name : t.abbrev, title: t.name }))
    : parallels.map((id) => ({ id, label: id, title: id }))
  const currentName = translations.find((t) => t.id === translation)?.name
  const setColumn = (id: string): void => {
    setParallels(chooseColumn(parallels, index, id))
  }
  return (
    <div className="h-9 shrink-0 border-b border-line bg-panel px-2 flex items-center gap-1">
      <select
        ref={selectRef}
        value={translation}
        onChange={(e) => setColumn(e.target.value)}
        title={currentName}
        className="flex-1 min-w-0 bg-elevated border border-line rounded-md text-xs px-2 py-1 text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} title={o.title}>
            {o.label}
          </option>
        ))}
      </select>
      {canRemove && (
        <button
          onClick={() => setParallels(parallels.filter((_, i) => i !== index))}
          title="Close this column"
          className="w-6 h-6 shrink-0 rounded text-faint hover:text-accent hover:bg-elevated text-xs leading-none"
        >
          ✕
        </button>
      )}
    </div>
  )
}

interface ColumnProps {
  translation: string
  index: number
  canRemove: boolean
  book: string
  chapter: number
  alignTo: number | null
  takeScrollControl: () => void
  registerRef: (el: HTMLDivElement | null) => void
  onScroll: () => void
}

function Column({ translation, index, canRemove, book, chapter, alignTo, takeScrollControl, registerRef, onScroll }: ColumnProps): JSX.Element {
  const { data, loading, error } = useChapter(translation, book, chapter)
  const meta = useAppStore((s) => s.translations.find((x) => x.id === translation))
  const strongsVisible = useAppStore((s) => s.strongsVisible)
  const sourceWords = useAppStore(s => s.restoreSourceWords)
  const defaults = useAppStore(s => s.displayDefaults)
  const overrides = useAppStore(s => s.displayOverrides)
  const display = editionDisplay(defaults, overrides, translation)
  const inspect = useAppStore(s => s.inspectStudy)
  const hasParallel = useAppStore(s => s.parallels.length >= 2)
  const highlights = useHighlights(translation, book, chapter)
  const { byVerse, loading: notesLoading, error: notesError, retry: retryNotes } = useNotes(book, chapter, translation, data?.verses)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ verse: number; x: number; y: number } | null>(null)
  // Floating "Ask the assistant" button shown when the reader selects text.
  const [sel, setSel] = useState<{ x: number; y: number; text: string; v1: number; v2: number } | null>(null)
  const askAssistantAbout = useAppStore((s) => s.askAssistantAbout)
  const focusVerse = useAppStore((s) => s.focusVerse)
  const rtl = data?.direction === 'rtl'
  const bookName = BOOK_BY_ID[book]?.name ?? book

  // On mouse-up, if the reader selected some verse text, offer to ask the assistant about it.
  const onMouseUp = (): void => {
    const el = containerRef.current
    const selection = window.getSelection()
    if (!el || !selection || selection.isCollapsed) return setSel(null)
    const range = selection.rangeCount ? selection.getRangeAt(0) : null
    const passage = el.querySelector<HTMLElement>('[data-scripture-passage]')
    if (!range || !passage?.contains(range.commonAncestorContainer)) return setSel(null)
    const selected = publishedSelection(passage, range)
    if (!selected?.text.trim()) return setSel(null)
    const rect = range.getBoundingClientRect()
    const cr = el.getBoundingClientRect()
    setSel({
      x: rect.left - cr.left + el.scrollLeft,
      y: rect.top - cr.top + el.scrollTop,
      ...selected
    })
  }

  const askAboutSelection = (): void => {
    if (!sel) return
    const lo = Math.min(sel.v1, sel.v2)
    const hi = Math.max(sel.v1, sel.v2)
    askAssistantAbout({
      book,
      bookName,
      chapter,
      verse: lo,
      endVerse: hi !== lo ? hi : undefined,
      translation,
      text: sel.text
    })
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }

  useVerseNavigation(containerRef, `${translation}:${book}:${chapter}`, !loading && !!data, index === 0, translation)

  const requested = useAppStore((s) => s.scrollToVerse)
  const lastAlign = useRef('')
  useEffect(() => {
    if (!data || alignTo == null) { lastAlign.current = ''; return }
    const key = `${translation}:${book}:${chapter}:${alignTo}`
    if (lastAlign.current === key) return
    lastAlign.current = key
    if (requested != null || alignTo === data.verses[0]?.verse) return
    const el = containerRef.current
    const row = el?.querySelector<HTMLElement>(`[data-verse="${alignTo}"]`)
    if (el && row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top
  }, [data, alignTo, requested, translation, book, chapter])

  // A menu or text selection belongs to the passage where it was opened.
  useEffect(() => {
    setMenu(null)
    setSel(null)
  }, [book, chapter, translation])

  const openMenu = (verse: number, e: React.MouseEvent): void => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    focusVerse(book, chapter, verse, translation)
    const trigger = e.currentTarget.getBoundingClientRect()
    const x = e.detail === 0 ? trigger.left : e.clientX
    const y = e.detail === 0 ? trigger.bottom : e.clientY
    setMenu({ verse, x: Math.max(0, Math.min(x - r.left, el.clientWidth - 256)) + el.scrollLeft, y: y - r.top + el.scrollTop })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <ColumnHeader translation={translation} index={index} canRemove={canRemove} />
      <div className="shrink-0 px-2 text-xs text-muted" aria-label="Native passage">{bookName}{display.chapterNumbers && ` ${chapter}`} · {translation}</div>
      <div
        ref={(el) => {
          containerRef.current = el
          registerRef(el)
        }}
        onWheelCapture={takeScrollControl}
        onPointerDownCapture={takeScrollControl}
        onKeyDownCapture={takeScrollControl}
        onScroll={() => {
          onScroll()
          if (sel) setSel(null)
        }}
        onMouseUp={onMouseUp}
        className="flex-1 overflow-y-auto relative"
      >
        <div className="max-w-prose mx-auto px-8 py-8">
          {error ? (
          <StateBlock title="Library not built">
            {/not found/i.test(error) ? (
              <>
                Run <code className="text-accent">npm run db:build</code> to create the offline text
                database.
              </>
            ) : (
              error
            )}
          </StateBlock>
        ) : loading ? (
          <div className="animate-pulse space-y-3 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 rounded bg-line/60" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        ) : !data || data.verses.length === 0 ? (
          <StateBlock title="Not available">
            This chapter isn&rsquo;t available in {meta?.name ?? translation}.
          </StateBlock>
        ) : (
          <>
          {display.structured && <StructuredPassages edition={translation} book={book} chapter={chapter} verses={data.verses.map(v => v.verse)} />}
          <div
            data-scripture-passage=""
            dir={rtl ? 'rtl' : 'ltr'}
            className={`text-scripture text-ink hyphens-auto ${
              // Anything that changes word widths mid-line — Strong's numbers, replacements —
              // makes justified spacing lurch. Left-align reads cleaner then.
              strongsVisible || sourceWords || (display.literary && data.verses.some(v => v.layout?.some(m => m.kind !== 'speaker'))) ? 'text-start leading-[2.15]' : 'text-justify'
            } ${rtl ? 'font-hebrew text-right' : 'font-serif'}`}
          >
            {data.verses.map((v) => (
              <VerseView
                key={v.verse}
                v={v}
                literary={display.literary} speakers={display.speakers} headings={display.headings} verseNumbers={display.verseNumbers}
                translation={translation} book={book} chapter={chapter}
                highlight={highlights.get(v.verse)}
                hasNote={byVerse.has(v.verse)}
                onOpenMenu={openMenu}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {sel && (
        <div
          style={{ top: Math.max(sel.y - 34, 0), left: sel.x }}
          onMouseDown={(e) => e.preventDefault()} // keep the text selection intact
          className="absolute z-30 flex items-center gap-2 rounded-md bg-panel border border-line text-accent text-xs font-medium px-2 py-1 shadow-lg"
        >
          <button onClick={askAboutSelection} className="flex items-center gap-1"><SparkleIcon className="w-3.5 h-3.5" /> Ask</button>
          {(['context', ...(hasParallel ? ['compare' as const] : [])] as const).map(mode =>
            <button key={mode} onClick={() => { inspect({ mode, range: { edition: translation, book, chapter, firstVerse: Math.min(sel.v1, sel.v2), lastVerse: Math.max(sel.v1, sel.v2) } }); setSel(null) }}>{mode === 'context' ? 'Context' : 'Compare layout'}</button>)}
        </div>
      )}

      {menu && (
        <VersePopover
          x={menu.x}
          y={menu.y}
          translation={translation}
          book={book}
          chapter={chapter}
          verse={menu.verse}
          verseText={data?.verses.find((x) => x.verse === menu.verse)?.text ?? ''}
          highlight={highlights.get(menu.verse)}
          note={byVerse.get(menu.verse)?.[0]}
          notesLoading={notesLoading} notesError={notesError} retryNotes={retryNotes}
          onClose={() => {
            setMenu(null)
            containerRef.current?.querySelector<HTMLElement>(`[data-verse="${menu.verse}"] [data-verse-action]`)?.focus({ preventScroll: true })
          }}
        />
      )}
      </div>
    </div>
  )
}

function StateBlock({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <BookIcon className="w-10 h-10 text-faint mb-3" />
      <p className="text-sm text-ink font-medium">{title}</p>
      <p className="text-sm text-muted max-w-xs leading-relaxed mt-1">{children}</p>
    </div>
  )
}
