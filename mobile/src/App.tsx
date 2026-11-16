import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { App as AndroidApp } from '@capacitor/app'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { BOOK_BY_ID } from '@shared/books'
import { mapPassage } from '@shared/passageMapping'
import { editionDisplay } from '@shared/readingDisplay'
import type { VerseRef } from '@shared/types'
import { readingEdition, useAppStore, type Activity } from '@/store/useAppStore'
import { useReadingSequence } from '@/hooks/useChapterStream'
import { useEditions } from '@/hooks/useInterlinear'
import { readerChapter } from '@/lib/passage'
import { publishedCopy, publishedSelection } from '@/lib/scriptureSelection'
import { readSize, sizeKey } from './phonePreferences'
import { readPosition, readerViewKey, savePosition, type ReadingPosition } from '@/lib/readingPosition'
import RetainedView from '@/components/RetainedView'
import ReadingPanel from '@/components/ReadingPanel'
import WordsView from '@/components/WordsView'
import MapsView from '@/components/MapsView'
import TimelinesView from '@/components/TimelinesView'
import GenealogiesView from '@/components/GenealogiesView'
import LearnView from '@/components/LearnView'
import SearchPanel from '@/components/SearchPanel'
import LexiconCard from '@/components/LexiconCard'
import ApparatusPanel from '@/components/ApparatusPanel'
import CrossRefsPanel from '@/components/CrossRefsPanel'
import NotesPanel from '@/components/NotesPanel'
import NotebookPanel from '@/components/NotebookPanel'
import PassageInspector from '@/components/PassageInspector'
import OriginalVerseComparison from '@/components/OriginalVerseComparison'
import { ComparisonContent } from '@/components/RestoredWordComparison'
import { ReaderActions, type ReaderVerseAction, type ReaderWordAction } from '@/components/ReaderActions'
import { useTheme } from '@/hooks/useTheme'
import SettingsDialog from '@/components/SettingsDialog'
import SourceWordSettings from '@/components/SourceWordSettings'
import {
  BookIcon,
  SearchIcon,
  WordsIcon,
  ColumnsIcon,
  SettingsIcon,
  ChevronRight,
  MapPinIcon,
  TimelineIcon,
  GenealogyIcon,
  LearnIcon,
  NotebookIcon,
  BookmarkIcon,
  FileIcon,
  LinkIcon,
  CompareIcon,
  InterlinearIcon,
  PenIcon
} from '@/components/icons'
import {
  BackupTools,
  DisplaySettings,
  EditionPicker,
  PassagePicker,
  PhoneSheet,
  SavedPlaces,
  Tool,
  VerseActions,
  VersePicker,
  bookName
} from './PhoneTools'
import AndroidUpdates, { AndroidUpdateNotice } from './AndroidUpdates'
import { Study } from './study'

declare global {
  interface Window {
    studyPublishedSelection?: () => string | null
  }
}
type Page = Activity | 'library' | 'search' | 'notebook'
type Sheet =
  | 'passage'
  | 'editions'
  | 'settings'
  | 'saved'
  | 'files'
  | 'updates'
  | 'tools'
  | 'word'
  | 'context'
  | 'comparison'
  | 'verse'
  | 'pickVerse'
  | 'originals'
  | 'variants'
  | 'refs'
  | 'notes'
  | 'allNotes'
const pageTitles: Record<Page, string> = {
  bible: 'Reader',
  search: 'Search',
  words: 'Words',
  library: 'Study library',
  maps: 'Atlas',
  genealogies: 'People',
  timelines: 'Timeline',
  learn: 'Languages',
  notebook: 'Notebook'
}
const sheetTitles: Record<Sheet, string> = {
  passage: 'Go to passage',
  editions: 'Translations',
  settings: 'Reading settings',
  saved: 'Bookmarks & history',
  files: 'Files & settings',
  updates: 'App updates',
  tools: 'Passage tools',
  word: 'Word study',
  context: 'Passage study',
  comparison: 'Translation wording',
  verse: 'Verse',
  pickVerse: 'Choose a verse',
  originals: 'Source texts',
  variants: 'Textual variants',
  refs: 'Cross-references',
  notes: 'Verse notes',
  allNotes: 'All notes & highlights'
}
const libraryPages: Page[] = ['library', 'maps', 'genealogies', 'timelines', 'learn', 'notebook']
type Position = ReadingPosition
type ReaderState = ReturnType<typeof useAppStore.getState>
type PassageReturn = {
  reader: ReturnType<typeof snapshot>
  page: Page
  sheets: Sheet[]
  verseItem: ReaderVerseAction | null
  wordItem: ReaderWordAction | null
  word: Pick<ReaderState, 'selectedStrongs' | 'selectedOccurrence'>
  inspector: ReaderState['studyInspector']
}
function snapshot(s: ReaderState, pos: Position | null) {
  const translation = readingEdition(s)
  const ref = readerChapter(s.book, s.chapter, s.activeVerse, s.referenceEdition || s.primary, translation)
  const exact =
    pos && (!pos.viewKey || pos.viewKey === readerViewKey(s)) && Boolean(pos.interlinear) === s.interlinear && ref && pos.book === ref.book && pos.chapter === ref.chapter && pos.translation === translation
      ? pos
      : null
  return {
    book: exact?.book ?? s.book,
    chapter: exact?.chapter ?? s.chapter,
    verse: exact?.verse ?? s.activeVerse ?? 1,
    referenceEdition: exact?.translation ?? (s.referenceEdition || s.primary),
    primary: s.primary,
    parallels: s.parallels,
    interlinear: s.interlinear,
    interlinearEdition: s.interlinearEdition
  }
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
export default function App() {
  const activity = useAppStore((s) => s.activity),
    book = useAppStore((s) => s.book),
    chapter = useAppStore((s) => s.chapter)
  const primary = useAppStore((s) => s.primary),
    referenceEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const verse = useAppStore((s) => s.activeVerse),
    edition = useAppStore(readingEdition),
    interlinear = useAppStore((s) => s.interlinear)
  const parallels = useAppStore((s) => s.parallels),
    theme = useTheme(),
    selected = useAppStore((s) => s.selectedStrongs)
  const labels = useAppStore(s => s.translations)
  const editionLabel = labels.find(item => item.id === primary)?.abbrev ?? primary
  const inspector = useAppStore((s) => s.studyInspector)
  const chapterNumbers = useAppStore(
    (s) => editionDisplay(s.displayDefaults, s.displayOverrides, edition).chapterNumbers
  )
  const [page, setPage] = useState<Page>(activity),
    [sheets, setSheets] = useState<Sheet[]>([])
  const sheet = sheets.at(-1)
  const stack = useRef(sheets)
  const atlasSheets = useRef<Sheet[]>([])
  const profileSheets = useRef<Sheet[]>([])
  const [notebookVisited, setNotebookVisited] = useState(false)
  const [openWordEntry, setOpenWordEntry] = useState<{ id: string }>()
  const profileOrigin = useAppStore(s => s.profileOrigin)
  const atlasOrigin = useAppStore(s => s.atlasOrigin)
  const atlasReturn = atlasOrigin?.activity === 'bible' ? 'passage' : atlasOrigin?.activity === 'genealogies' ? 'profile' : atlasOrigin && pageTitles[atlasOrigin.activity]
  const strongsBack = useAppStore((s) => s.strongsBack.length),
    strongsForward = useAppStore((s) => s.strongsForward.length)
  const [verseColumns, setVerseColumns] = useState<{ translation: string; book: string; chapter: number; verse?: number }[]>([])
  const [verseItem, setVerseItem] = useState<ReaderVerseAction | null>(null),
    [wordItem, setWordItem] = useState<ReaderWordAction | null>(null)
  const currentItems = useRef({ verseItem, wordItem })
  currentItems.current = { verseItem, wordItem }
  const [size, setSize] = useState(readSize)
  const [notice, setNotice] = useState(''),
    [selection, setSelection] = useState('')
  const [selectionInChapter, setSelectionInChapter] = useState(false)
  const [catalogError, setCatalogError] = useState(''),
    [attempt, retry] = useState(0)
  const surface = useRef<HTMLDivElement>(null),
    currentPage = useRef(page)
  const wordPress = useRef<{ word: Element; time: number } | null>(null)
  const toastTimer = useRef<number>()
  const passageBack = useRef<PassageReturn[]>([]),
    applyingBack = useRef(false)
  currentPage.current = page
  const passageOrigin = passageBack.current.at(-1)?.page
  const native = readerChapter(book, chapter, verse, referenceEdition, edition)
  const readerBook = native?.book ?? book,
    readerChapterNum = native?.chapter ?? chapter
  const bookTitle = bookName(readerBook) + (chapterNumbers ? ' ' + readerChapterNum : '')
  const announce = (text: string) => {
    setNotice(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setNotice(''), 2600)
  }
  useEditions()
  useEffect(() => {
    let live = true
    setCatalogError('')
    window.api
      .listTranslations()
      .then((t) => {
        if (live) useAppStore.getState().setTranslations(t)
      })
      .catch((e) => {
        if (live) setCatalogError(String(e))
      })
    return () => {
      live = false
    }
  }, [attempt])
  useEffect(() => {
    if (Capacitor.isNativePlatform())
      void SystemBars.setStyle({
        style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
      }).catch(() => {})
  }, [theme])
  const imported = referenceEdition.startsWith('imp_') || edition.startsWith('imp_')
  const historyRef = imported ? null : readerChapter(book, chapter, verse, referenceEdition, 'KJV')
  useEffect(() => {
    if (historyRef) void window.api.addHistory(historyRef.book, historyRef.chapter).catch(() => {})
  }, [historyRef?.book, historyRef?.chapter])
  const replaceSheets = useCallback((next: Sheet[]) => {
    stack.current = next
    setSheets(next)
  }, [])
  const pushSheet = useCallback((next: Sheet) => {
    if (stack.current.at(-1) !== next) replaceSheets([...stack.current, next])
  }, [replaceSheets])
  const close = useCallback(() => {
    replaceSheets([])
    useAppStore.getState().inspectStudy(null)
  }, [replaceSheets])
  const popSheet = useCallback(() => {
    const old = stack.current.at(-1)
    replaceSheets(stack.current.slice(0, -1))
    if (old === 'context') useAppStore.getState().inspectStudy(null)
  }, [replaceSheets])
  function navigate(next: Page) {
    close()
    if (next === 'bible' && currentPage.current !== 'bible') passageBack.current = []
    if (next === 'notebook') setNotebookVisited(true)
    const activity = ['library', 'search', 'notebook'].includes(next) ? 'bible' : next as Activity
    useAppStore.getState().setActivity(activity)
    setPage(next)
  }
  const syncReadingAnchor = () => {
    const pos = readPosition()
    if (!pos || (pos.viewKey && pos.viewKey !== readerViewKey(useAppStore.getState())) ||
        Boolean(pos.interlinear) !== interlinear) return
    const column = [...(surface.current?.querySelectorAll<HTMLElement>('[data-reader-scroll], [data-interlinear-reader]') ?? [])]
      .find(el => (el.dataset.readerScroll || el.dataset.readerEdition) === pos.translation &&
        el.dataset.readerBook === pos.book && Number(el.dataset.readerChapter) === pos.chapter)
    if (column) {
      useAppStore.getState().focusVerse(pos.book, pos.chapter, pos.verse, pos.translation)
      savePosition({ ...pos, viewKey: readerViewKey(useAppStore.getState()) })
    }
  }
  function openSheet(next: Sheet) {
    if (page === 'bible' && !sheet) syncReadingAnchor()
    pushSheet(next)
  }
  useEffect(
    () =>
      useAppStore.subscribe((s, previous) => {
        if (applyingBack.current) return
        const originPage = currentPage.current
        const originSheets = stack.current
        if (s.activity !== previous.activity) {
          if (s.activity === 'maps') atlasSheets.current = originSheets
          if (s.activity === 'genealogies' && s.focusPersonId != null &&
              !(previous.activity === 'maps' && previous.atlasOrigin?.activity === 'genealogies' && !s.atlasOrigin))
            profileSheets.current = originSheets
          const returning = previous.activity === 'maps' && previous.atlasOrigin?.activity === s.activity && !s.atlasOrigin
          setPage(s.activity)
          replaceSheets(returning ? atlasSheets.current : [])
        }
        if (s.scrollToVerse !== null && s.readerVisit !== previous.readerVisit) {
          const last = snapshot(previous, readPosition())
          const sheetsToRestore = originSheets.filter(x => !['passage', 'saved'].includes(x))
          if (originPage !== 'bible' || sheetsToRestore.length || last.book !== s.book ||
              last.chapter !== s.chapter || last.verse !== s.scrollToVerse ||
              last.referenceEdition !== (s.referenceEdition || s.primary)) {
            const origin: PassageReturn = {
              reader: last, page: originPage, sheets: sheetsToRestore, inspector: previous.studyInspector,
              ...currentItems.current,
              word: { selectedStrongs: previous.selectedStrongs, selectedOccurrence: previous.selectedOccurrence }
            }
            passageBack.current = [...passageBack.current.slice(-49), origin]
          }
          const translation = readingEdition(s)
          const next = mapPassage(
            { book: s.book, chapter: s.chapter, verse: s.scrollToVerse },
            s.referenceEdition || s.primary,
            translation
          )
          if (next) {
            savePosition({ ...next, translation, scroll: null, interlinear: s.interlinear, viewKey: readerViewKey(s) })
          }
          setPage('bible')
          replaceSheets([])
        }
        if (s.studyInspector && s.studyInspector !== previous.studyInspector) {
          pushSheet('context')
        }
        if (!s.studyInspector && previous.studyInspector && stack.current.at(-1) === 'context') popSheet()
        if (
          s.activity !== 'words' &&
          s.selectedStrongs &&
          (s.selectedStrongs !== previous.selectedStrongs ||
            s.selectedOccurrence !== previous.selectedOccurrence)
        ) {
          pushSheet('word')
        }
      }),
    []
  )
  useEffect(() => {
    const open = () => navigate('notebook')
    window.addEventListener('study:open-notebook', open)
    return () => window.removeEventListener('study:open-notebook', open)
  }, [])
  useEffect(() => {
    const el = surface.current!
    function current() {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || sel.isCollapsed) return null
      const range = sel.getRangeAt(0)
      if (![...el.querySelectorAll('[data-scripture-passage]')].some((p) => range.intersectsNode(p)))
        return null
      return publishedCopy(el, sel) ?? sel.toString()
    }
    window.studyPublishedSelection = current
    const update = () => {
      const text = current() ?? ''
      const range = text && window.getSelection()?.getRangeAt(0)
      const node = range && range.commonAncestorContainer
      const container = node && (node instanceof Element ? node : node.parentElement)
      setSelectionInChapter(!!container && !!container.closest('[data-scripture-passage]'))
      setSelection(text)
    }
    document.addEventListener('selectionchange', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      delete window.studyPublishedSelection
    }
  }, [])
  function returnFromPerson() {
    const origin = useAppStore.getState().profileOrigin
    if (!origin) return
    useAppStore.getState().setActivity(origin)
    setPage(origin)
    replaceSheets(profileSheets.current)
    profileSheets.current = []
  }
  function context(mode: 'context' | 'compare', ref?: VerseRef, last?: number) {
    syncReadingAnchor()
    const s = useAppStore.getState()
    const range = ref
      ? {
          edition: ref.translation,
          book: ref.book,
          chapter: ref.chapter,
          firstVerse: ref.verse,
          lastVerse: last
        }
      : {
          edition: s.referenceEdition || s.primary,
          book: s.book,
          chapter: s.chapter,
          firstVerse: s.activeVerse ?? undefined
        }
    s.inspectStudy({ mode, range })
    pushSheet('context')
  }
  function inspectSelection(mode: 'context' | 'compare') {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const node =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement
    const passage = node?.closest<HTMLElement>('[data-scripture-passage]'),
      col = passage?.closest<HTMLElement>('[data-reader-scroll]')
    if (!passage || !col || !passage.contains(range.commonAncestorContainer)) return
    const area = publishedSelection(passage, range)
    const ed = col.dataset.readerScroll!
    const section = passage.closest<HTMLElement>('[data-flow-chapter]')
    const [selectedBook, selectedChapter] = section?.dataset.flowChapter?.split('/') ?? []
    if (!area || !selectedBook || !selectedChapter) return
    sel.removeAllRanges()
    context(mode, { book: selectedBook, chapter: Number(selectedChapter), verse: area.v1, translation: ed }, area.v2)
  }
  const back = useRef<() => void>(() => {})
  back.current = () => {
    const restored = document.querySelector<HTMLButtonElement>('[data-dismiss-restore]')
    if (restored) { restored.click(); return }
    const s = useAppStore.getState()
    if (s.settingsOpen) {
      s.setSettingsOpen(false)
      return
    }
    if (s.sourceWordSettingsOpen) {
      s.setSourceWordSettingsOpen(false)
      return
    }
    if (sheet) {
      popSheet()
      return
    }
    if (window.getSelection()?.isCollapsed === false) {
      window.getSelection()?.removeAllRanges()
      return
    }
    if (page === 'genealogies' && s.profileOrigin) {
      returnFromPerson()
      return
    }
    const dirBack = Array.from(surface.current?.querySelectorAll<HTMLButtonElement>('[data-phone-back]') ?? []).find(btn => btn.offsetParent !== null)
    if (dirBack) {
      dirBack.click()
      return
    }
    if (page === 'maps' && s.atlasOrigin) {
      s.returnFromAtlas()
      return
    }
    if (page !== 'bible') {
      navigate(libraryPages.includes(page) && page !== 'library' ? 'library' : 'bible')
      return
    }
    const previous = passageBack.current.pop()
    if (previous) {
      applyingBack.current = true
      try {
        const { verse: previousVerse, ...reader } = previous.reader
        useAppStore.setState({
          ...reader,
          activeVerse: previousVerse,
          scrollToVerse: previousVerse,
          activity: ['search', 'library', 'notebook'].includes(previous.page) ? 'bible' : previous.page as Activity,
          ...previous.word, studyInspector: previous.inspector
        })
        setVerseItem(previous.verseItem)
        setWordItem(previous.wordItem)
        setPage(previous.page)
        replaceSheets(previous.sheets)
      } finally {
        applyingBack.current = false
      }
      return
    }
    if (Capacitor.isNativePlatform()) void AndroidApp.minimizeApp()
  }
  useEffect(() => {
    const android = Capacitor.isNativePlatform()
      ? AndroidApp.addListener('backButton', () => back.current())
      : undefined
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]') && !e.defaultPrevented) {
        e.preventDefault()
        back.current()
      }
    }
    window.addEventListener('keydown', escape)
    return () => {
      void android?.then((h) => h.remove())
      window.removeEventListener('keydown', escape)
    }
  }, [])
  const sequence = useReadingSequence(edition, interlinear)
  function adjacent(delta: -1 | 1) {
    const i = sequence.findIndex(ref => ref.book === readerBook && ref.chapter === readerChapterNum)
    return i >= 0 ? sequence[i + delta] : null
  }
  function step(delta: -1 | 1) {
    const next = adjacent(delta)
    if (next) useAppStore.getState().goToVerse(next.book, next.chapter, next.firstVerse, edition)
  }
  function toggleInterlinear() {
    syncReadingAnchor()
    useAppStore.getState().toggleInterlinear()
    navigate('bible')
  }
  function chooseVerse() {
    const source = useAppStore.getState()
    const sourceEdition = source.referenceEdition || source.primary
    const cols = Array.from(surface.current?.querySelectorAll<HTMLElement>('[data-reader-scroll]') ?? [])
    const choices = cols.map(col => {
      const translation = col.dataset.readerScroll!
      const selectedRef = source.activeVerse == null ? null : mapPassage(
        { book: source.book, chapter: source.chapter, verse: source.activeVerse }, sourceEdition, translation)
      return { translation, book: col.dataset.readerBook!, chapter: Number(col.dataset.readerChapter),
        verse: Number(col.dataset.readerAnchor) || selectedRef?.verse }
    })
    if (interlinear) {
      const ref = readerChapter(source.book, source.chapter, source.activeVerse, sourceEdition, source.primary)
      if (ref) choices.push({ translation: source.primary, ...ref, verse: 'verse' in ref ? Number(ref.verse) : undefined })
    }
    setVerseColumns(choices)
    pushSheet('pickVerse')
  }
  const actions = {
    openLexicon: () => pushSheet('word'),
    verse: (i: ReaderVerseAction) => {
      setVerseItem(i)
      pushSheet('verse')
    },
    compare: (i: ReaderWordAction) => {
      setWordItem(i)
      pushSheet('comparison')
    }
  }
  function startWord(i: ReaderWordAction) {
    useAppStore
      .getState()
      .selectStrongs(i.source.strongs, {
        translation: i.translation,
        book: i.source.book,
        chapter: i.source.chapter,
        verse: i.source.verse,
        surface: i.source.english,
        position: i.source.startPosition,
        derived: false,
        sourceWord: i.source
      })
    pushSheet('word')
  }
  return (
    <div className="phone" style={{ '--reading-size': (size / 16) + 'rem' } as CSSProperties}>
      <header className="appbar">
        <div className="identity">
          <span className="brand-icon">
            <BookIcon />
          </span>
          <span>Open Bible Study</span>
        </div>
        <div className="appbar-end">
          <button
            className="phone-icon"
            title="Bookmarks and history"
            aria-label="Bookmarks and history"
            onClick={() => openSheet('saved')}
          >
            <BookmarkIcon />
          </button>
          <button
            className="phone-icon"
            title="Reading settings"
            aria-label="Reading settings"
            onClick={() => openSheet('settings')}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>
      <AndroidUpdateNotice openUpdates={() => openSheet('updates')} />
      <div className="surface" ref={surface}>
        <div hidden={page !== 'bible'} className="phone-reader">
          <div className="reader-rail">
            <button
              className="passage-choice"
              aria-label="Choose passage"
              onClick={() => openSheet('passage')}
            >
              <span>{bookTitle}</span>
              <ChevronRight />
            </button>
            <button
              className="edition-choice"
              title={'Translations and parallels · ' + parallels.join(' / ')}
              aria-label={'Translations and parallels · ' + parallels.join(' / ')}
              onClick={() => openSheet('editions')}
            >
              <span className="edition-name">{editionLabel}{parallels.length > 1 && ' +' + (parallels.length - 1)}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            <button className="reader-mode" onClick={toggleInterlinear}
              aria-label={interlinear ? 'Return to translation' : 'Switch to interlinear'}>
              {interlinear ? 'Translation' : 'Interlinear'}
            </button>
            <button
              className="phone-icon"
              aria-label="Passage tools"
              title="Passage tools"
              onClick={() => openSheet('tools')}
            >
              <ColumnsIcon />
            </button>
          </div>
          {catalogError ? (
            <div className="screen-pad" role="alert">
              {catalogError} <button onClick={() => retry((n) => n + 1)}>Retry</button>
            </div>
          ) : (
            <div className="reader-pane"
              onPointerDownCapture={event => {
                const word = event.pointerType === 'touch' && event.target instanceof Element
                  ? event.target.closest('[data-restored-word]') : null
                wordPress.current = word ? { word, time: event.timeStamp } : null
              }}
              onPointerCancelCapture={() => { wordPress.current = null }}
              onClickCapture={event => {
                const press = wordPress.current
                wordPress.current = null
                // Some WebViews emit a click after a selection hold, even without a selected range.
                if (event.detail > 0 && press && event.target instanceof Node && press.word.contains(event.target) &&
                    event.timeStamp - press.time >= 500) event.stopPropagation()
              }}>
              <ReaderActions.Provider value={actions}>
                <ReadingPanel />
              </ReaderActions.Provider>
            </div>
          )}
          {selection ? (
            <div className="chapter-steps">
              <button
                onPointerDown={(e) => e.preventDefault()}
                onClick={() =>
                  Study.copyText({ text: selection })
                    .then(() => announce('Published wording copied.'))
                    .catch((e) => announce(String(e)))
                }
              >
                Copy
              </button>
              {selectionInChapter && <button onPointerDown={(e) => e.preventDefault()} onClick={() => inspectSelection('context')}>
                Context
              </button>}
              {selectionInChapter && parallels.length > 1 && (
                <button
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => inspectSelection('compare')}
                >
                  Compare layout
                </button>
              )}
              <button
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => Study.shareText({ text: selection }).catch((e) => announce(String(e)))}
              >
                Share
              </button>
            </div>
          ) : (
            <div className="chapter-steps">
              <button aria-label="Previous chapter" disabled={!adjacent(-1)} onClick={() => step(-1)}>
                <ChevronRight className="rotate-180" />
                Previous
              </button>
              {passageOrigin && passageOrigin !== 'bible'
                ? <button onClick={() => back.current()}>Back to {pageTitles[passageOrigin]}</button>
                : <span>{(BOOK_BY_ID[readerBook].testament === 'OT' ? 'Old' : 'New') + ' Testament'}</span>}
              <button aria-label="Next chapter" disabled={!adjacent(1)} onClick={() => step(1)}>
                Next
                <ChevronRight />
              </button>
            </div>
          )}
        </div>
        {notebookVisited && (
          <section hidden={page !== 'notebook'} className="work-page page-notebook">
            <div className="workspace-title">
              <button
                aria-label="Back to study library"
                className="phone-icon"
                onClick={() => navigate('library')}
              >
                <ChevronRight className="rotate-180" />
              </button>
              <h1>Notebook</h1>
            </div>
            <div className="work-content">
              <NotebookPanel visible={page === 'notebook'} />
            </div>
          </section>
        )}
        {(['search','words','genealogies','maps','timelines','learn','library'] as const).map(workspace => (
          <RetainedView key={workspace} active={page === workspace} className={'work-page page-' + workspace}>
            <div className="workspace-title">
              {libraryPages.includes(workspace) && workspace !== 'library' && (
                <button
                  aria-label={'Back to ' + (workspace === 'maps' && atlasReturn ? atlasReturn : workspace === 'genealogies' && profileOrigin ? pageTitles[profileOrigin] : 'study library')}
                  className="phone-icon"
                  onClick={() => {
                    if (workspace === 'maps' && atlasOrigin) useAppStore.getState().returnFromAtlas()
                    else if (workspace === 'genealogies' && profileOrigin) returnFromPerson()
                    else navigate('library')
                  }}
                >
                  <ChevronRight className="rotate-180" />
                </button>
              )}
              <h1>{pageTitles[workspace]}</h1>
            </div>
            <div className="work-content">
              {workspace === 'search' && <SearchPanel />}
              {workspace === 'words' && <WordsView openEntry={openWordEntry} />}
              {workspace === 'genealogies' && <GenealogiesView />}
              {workspace === 'maps' && <MapsView />}
              {workspace === 'timelines' && <TimelinesView />}
              {workspace === 'learn' && <LearnView />}
              {workspace === 'library' && (
                <div className="library-list">
                  <h2 className="section-label">Explore Scripture</h2>
                  <Tool
                    icon={MapPinIcon}
                    label="Atlas"
                    detail="Places, passages, and journeys"
                    onClick={() => navigate('maps')}
                  />
                  <Tool
                    icon={GenealogyIcon}
                    label="People"
                    detail="Families, ancestry, and verse references"
                    onClick={() => navigate('genealogies')}
                  />
                  <Tool
                    icon={TimelineIcon}
                    label="Timeline"
                    detail="Events in biblical history"
                    onClick={() => navigate('timelines')}
                  />
                  <Tool
                    icon={LearnIcon}
                    label="Languages"
                    detail="Greek and Hebrew lessons, vocabulary, and drills"
                    onClick={() => navigate('learn')}
                  />
                  <h2 className="section-label">My study</h2>
                  <Tool
                    icon={NotebookIcon}
                    label="Notebook"
                    detail="Write and organize Markdown notes"
                    onClick={() => navigate('notebook')}
                  />
                  <Tool icon={PenIcon} label="All notes & highlights" onClick={() => openSheet('allNotes')} />
                  <Tool icon={PenIcon} label={'Verse notes · ' + bookName(readerBook) + ' ' + readerChapterNum} onClick={() => openSheet('notes')} />
                  <Tool
                    icon={BookmarkIcon}
                    label="Bookmarks & history"
                    onClick={() => openSheet('saved')}
                  />
                  <Tool icon={ColumnsIcon} label="Translations" onClick={() => openSheet('editions')} />
                  <Tool
                    icon={FileIcon}
                    label="Files & settings"
                    detail="Backups, export, and app information"
                    onClick={() => openSheet('files')}
                  />
                </div>
              )}
            </div>
          </RetainedView>
        ))}
      </div>
      <nav className="tabbar" aria-label="Study navigation">
        {(
          [
            { id: 'bible', label: 'Read', Icon: BookIcon },
            { id: 'search', label: 'Search', Icon: SearchIcon },
            { id: 'words', label: 'Words', Icon: WordsIcon },
            { id: 'library', label: 'Library', Icon: MenuIcon }
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-current={
              page === id || (id === 'library' && libraryPages.includes(page)) ? 'page' : undefined
            }
            onClick={() => navigate(id)}
          >
            <span>
              <Icon />
            </span>
            {label}
          </button>
        ))}
      </nav>
      {sheets.map((sheet, depth) => (
        <PhoneSheet
          key={depth + sheet}
          back={depth > 0 ? popSheet : undefined}
          title={
            sheet === 'verse' && verseItem
              ? bookName(verseItem.book) + ' ' + verseItem.chapter + ':' + verseItem.verse
              : sheetTitles[sheet]
          }
          close={close}
          header={sheet !== 'comparison'}
          roomy={['word', 'context', 'verse', 'settings', 'variants', 'files'].includes(
            sheet
          )}
        >
          {sheet === 'passage' && <PassagePicker close={close} />}
          {sheet === 'editions' && <EditionPicker />}
          {(sheet === 'settings' || sheet === 'files') && (
            <button type="button" className="link-row mb-2" onClick={() => openSheet('updates')}>
              App updates <ChevronRight aria-hidden="true" />
            </button>
          )}
          {sheet === 'updates' && <AndroidUpdates />}
          {sheet === 'settings' && (
            <DisplaySettings
              size={size}
              changeSize={(n) => {
                setSize(n)
                localStorage.setItem(sizeKey(), String(n))
              }}
              preferred={() => {
                useAppStore.getState().setSettingsOpen(true)
              }}
              chooseTerms={() => {
                useAppStore.getState().setSourceWordSettingsOpen(true)
              }}
            />
          )}
          {sheet === 'saved' && <SavedPlaces close={close} />}
          {sheet === 'files' && <BackupTools />}
          {sheet === 'tools' && (
            <div className="tools-list">
              <Tool icon={PenIcon} label="Verse actions" detail="Choose a verse to annotate, highlight, copy or share" onClick={chooseVerse} />
              <Tool
                icon={InterlinearIcon}
                label={interlinear ? 'Return to translation' : 'Interlinear'}
                detail="Word-by-word Greek and Hebrew"
                onClick={toggleInterlinear}
              />
              <Tool icon={ColumnsIcon} label="Parallel translations" onClick={() => pushSheet('editions')} />
              <Tool icon={BookIcon} label="Passage context" onClick={() => context('context')} />
              {parallels.length > 1 && (
                <Tool icon={ColumnsIcon} label="Compare layout" onClick={() => context('compare')} />
              )}
              <Tool icon={LinkIcon} label="Cross-references" onClick={() => pushSheet('refs')} />
              <Tool icon={CompareIcon} label="Textual variants" onClick={() => pushSheet('variants')} />
              <Tool icon={PenIcon} label={'Verse notes · ' + bookName(readerBook) + ' ' + readerChapterNum} onClick={() => pushSheet('notes')} />
              <Tool icon={SettingsIcon} label="Reading display" onClick={() => pushSheet('settings')} />
            </div>
          )}
          {sheet === 'pickVerse' && <VersePicker columns={verseColumns} onOpen={item => {
            useAppStore.getState().focusVerse(item.book, item.chapter, item.verse, item.translation)
            actions.verse(item)
          }} />}
          {sheet === 'verse' && verseItem && (
            <VerseActions
              item={verseItem}
              context={() => context('context', verseItem)}
              showOriginals={() => pushSheet('originals')}
              showRefs={() => pushSheet('refs')}
            />
          )}
          {sheet === 'originals' && verseItem && <OriginalVerseComparison {...verseItem} initiallyOpen />}
          {sheet === 'word' && (
            <>
              <div className="word-nav" role="group" aria-label="Word lookup history">
                <button
                  disabled={!strongsBack}
                  aria-label="Back in word lookup history"
                  onClick={() => useAppStore.getState().strongsNavBack()}
                >
                  ‹ Earlier lookup
                </button>
                <button
                  disabled={!strongsForward}
                  aria-label="Forward in word lookup history"
                  onClick={() => useAppStore.getState().strongsNavForward()}
                >
                  Later lookup ›
                </button>
              </div>
              <LexiconCard id={selected} />
              {selected && (
                <button
                  className="phone-button"
                  onClick={() => {
                    navigate('words')
                    setOpenWordEntry({ id: selected })
                  }}
                >
                  Open in Words
                </button>
              )}
            </>
          )}
          {sheet === 'comparison' && wordItem && (
            <>
              <ComparisonContent target={wordItem} close={close} />
              <button className="link-row" onClick={() => startWord(wordItem)}>
                Open word study <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}
          {sheet === 'context' && inspector && <PassageInspector inspector={inspector} />}
          {sheet === 'allNotes' && <NotesPanel initialScope="all" onNavigate={close} />}
          {sheet === 'notes' && <NotesPanel onNavigate={close} />}
          {(['refs', 'variants'] as Sheet[]).includes(sheet) && imported ? (
            <p className="status">
              The verse numbering in this imported translation has no verified correspondence with the study
              references. You can highlight its verses in this edition.
            </p>
          ) : (
            <>
              {sheet === 'refs' && <CrossRefsPanel />}
              {sheet === 'variants' && <ApparatusPanel />}
            </>
          )}
        </PhoneSheet>
      ))}
      <SettingsDialog />
      <SourceWordSettings />
      {notice && (
        <div role="status" className="phone-toast">
          {notice}
        </div>
      )}
    </div>
  )
}
