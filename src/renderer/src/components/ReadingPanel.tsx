import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { BOOK_BY_ID } from '@shared/books'
import { useChapter } from '@/hooks/useChapter'
import { useHighlights, useNotes } from '@/hooks/useUserData'
import VerseView from './VerseView'
import VersePopover from './VersePopover'
import InterlinearReader from './InterlinearReader'
import { BookIcon, SparkleIcon } from './icons'

/** Walk up from a DOM node to the nearest verse element, returning its verse number. */
function verseOf(node: Node | null, container: HTMLElement): number | null {
  let el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null)
  while (el && el !== container) {
    const dv = el.getAttribute('data-verse')
    if (dv) return Number(dv)
    el = el.parentElement
  }
  return null
}

export default function ReadingPanel(): JSX.Element {
  const parallels = useAppStore((s) => s.parallels)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const interlinear = useAppStore((s) => s.interlinear)
  const translations = useAppStore((s) => s.translations)
  const setParallels = useAppStore((s) => s.setParallels)

  // Absolute scrollTop sync across parallel columns.
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const syncing = useRef(false)
  const onScroll = (idx: number): void => {
    if (syncing.current) return
    syncing.current = true
    const top = refs.current[idx]?.scrollTop ?? 0
    refs.current.forEach((el, i) => {
      if (el && i !== idx) el.scrollTop = top
    })
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  const canAdd = translations.length > parallels.length && parallels.length < 4
  const addColumn = (): void => {
    const next = translations.find((t) => !parallels.includes(t.id))?.id
    if (next) setParallels([...parallels, next])
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <ReplacementsBar />

      {interlinear ? (
        <div className="flex-1 min-h-0">
          <InterlinearReader book={book} chapter={chapter} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex divide-x divide-line">
          {parallels.map((t, i) => (
            <Column
              key={t + i}
              translation={t}
              index={i}
              canRemove={parallels.length > 1}
              book={book}
              chapter={chapter}
              registerRef={(el) => (refs.current[i] = el)}
              onScroll={() => onScroll(i)}
            />
          ))}
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
    </div>
  )
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
  const options = translations.length
    ? translations.map((t) => ({ id: t.id, label: t.abbrev }))
    : parallels.map((id) => ({ id, label: id }))
  const setColumn = (id: string): void => {
    const p = [...parallels]
    p[index] = id
    setParallels(p)
  }
  return (
    <div className="h-9 shrink-0 border-b border-line bg-panel px-2 flex items-center gap-1">
      <select
        value={translation}
        onChange={(e) => setColumn(e.target.value)}
        className="flex-1 min-w-0 bg-elevated border border-line rounded-md text-xs px-2 py-1 text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
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
  registerRef: (el: HTMLDivElement | null) => void
  onScroll: () => void
}

function Column({ translation, index, canRemove, book, chapter, registerRef, onScroll }: ColumnProps): JSX.Element {
  const { data, loading, error } = useChapter(translation, book, chapter)
  const meta = useAppStore((s) => s.translations.find((x) => x.id === translation))
  const strongsVisible = useAppStore((s) => s.strongsVisible)
  const highlights = useHighlights(translation, book, chapter)
  const { byVerse } = useNotes(book, chapter)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ verse: number; x: number; y: number } | null>(null)
  // Floating "Ask the assistant" button shown when the reader selects text.
  const [sel, setSel] = useState<{ x: number; y: number; text: string; v1: number; v2: number } | null>(null)
  const askAssistantAbout = useAppStore((s) => s.askAssistantAbout)
  const setActiveVerse = useAppStore((s) => s.setActiveVerse)
  const scrollToVerse = useAppStore((s) => s.scrollToVerse)
  const clearScroll = useAppStore((s) => s.clearScroll)
  const rtl = data?.direction === 'rtl'
  const bookName = BOOK_BY_ID[book]?.name ?? book

  // On mouse-up, if the reader selected some verse text, offer to ask the assistant about it.
  const onMouseUp = (): void => {
    const el = containerRef.current
    const selection = window.getSelection()
    if (!el || !selection || selection.isCollapsed) return setSel(null)
    const text = selection.toString().trim()
    const range = selection.rangeCount ? selection.getRangeAt(0) : null
    if (!text || !range || !el.contains(range.commonAncestorContainer)) return setSel(null)
    const v1 = verseOf(range.startContainer, el)
    const v2 = verseOf(range.endContainer, el)
    if (v1 == null) return setSel(null)
    const rect = range.getBoundingClientRect()
    const cr = el.getBoundingClientRect()
    setSel({
      x: rect.left - cr.left + el.scrollLeft,
      y: rect.top - cr.top + el.scrollTop,
      text,
      v1,
      v2: v2 ?? v1
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
      text: sel.text
    })
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }

  // Scroll to a verse requested via search / navigation, then flash it briefly. Only the first
  // column drives this — it clears the request, and the other columns follow via scroll sync, so
  // letting every column race for it left all but one parked at the top.
  useEffect(() => {
    if (index !== 0 || scrollToVerse == null || !data) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-verse="${scrollToVerse}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('verse-flash')
      window.setTimeout(() => el.classList.remove('verse-flash'), 1600)
    }
    clearScroll()
  }, [index, scrollToVerse, data, clearScroll])

  const openMenu = (verse: number, e: React.MouseEvent): void => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (index === 0) setActiveVerse(verse) // track the current verse for cross-refs + the assistant
    setMenu({ verse, x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <ColumnHeader translation={translation} index={index} canRemove={canRemove} />
      <div
        ref={(el) => {
          containerRef.current = el
          registerRef(el)
        }}
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
          <div
            dir={rtl ? 'rtl' : 'ltr'}
            className={`text-scripture text-ink hyphens-auto ${
              // Strong's numbers stretch justified lines; left-align reads cleaner then.
              strongsVisible ? 'text-left leading-[2.15]' : 'text-justify'
            } ${rtl ? 'font-hebrew text-right' : 'font-serif'}`}
          >
            {data.verses.map((v) => (
              <VerseView
                key={v.verse}
                v={v}
                highlight={highlights.get(v.verse)}
                hasNote={byVerse.has(v.verse)}
                onOpenMenu={openMenu}
              />
            ))}
          </div>
        )}
      </div>

      {sel && (
        <button
          style={{ top: Math.max(sel.y - 34, 0), left: sel.x }}
          onMouseDown={(e) => e.preventDefault()} // keep the text selection intact
          onClick={askAboutSelection}
          className="absolute z-30 flex items-center gap-1 rounded-md bg-accent text-white text-xs font-medium px-2 py-1 shadow-lg hover:opacity-90"
        >
          <SparkleIcon className="w-3.5 h-3.5" /> Ask
        </button>
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
          onClose={() => setMenu(null)}
        />
      )}
      </div>
    </div>
  )
}

function ReplacementsBar(): JSX.Element | null {
  const replacements = useAppStore((s) => s.replacements)
  const clearReplacement = useAppStore((s) => s.clearReplacement)
  const clearReplacements = useAppStore((s) => s.clearReplacements)
  const entries = Object.entries(replacements)
  if (entries.length === 0) return null
  return (
    <div className="shrink-0 border-b border-line bg-accent-soft/40 px-4 py-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-accent/80">Replacing</span>
      {entries.map(([s, text]) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 text-xs bg-panel border border-line rounded-full pl-2 pr-1 py-0.5"
        >
          <span className="text-faint tabular-nums">{s}</span>
          <span className="text-accent">→ {text}</span>
          <button
            onClick={() => clearReplacement(s)}
            className="w-4 h-4 rounded-full hover:bg-elevated text-faint hover:text-accent leading-none"
            title="Undo"
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={clearReplacements}
        className="text-xs text-muted hover:text-accent ml-1 underline"
      >
        Reset all
      </button>
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
