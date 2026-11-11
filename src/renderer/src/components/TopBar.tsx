import { readingEdition, useAppStore } from '@/store/useAppStore'
import { readerChapter } from '@/lib/passage'
import { editionDisplay } from '@shared/readingDisplay'
import { BOOK_BY_ID } from '@shared/books'
import HistoryPanel from './HistoryPanel'
import {
  BookIcon,
  SunIcon,
  MoonIcon,
  HashIcon,
  InterlinearIcon,
  InfoIcon,
  SparkleIcon,
  NotebookIcon,
  SettingsIcon,
  PenIcon
} from './icons'

export default function TopBar(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const strongsVisible = useAppStore((s) => s.strongsVisible)
  const toggleStrongs = useAppStore((s) => s.toggleStrongs)
  const restoring = useAppStore((s) => s.restoreSourceWords)
  const toggleSourceWords = useAppStore((s) => s.toggleSourceWords)
  const setSourceWordSettingsOpen = useAppStore((s) => s.setSourceWordSettingsOpen)
  const interlinear = useAppStore((s) => s.interlinear)
  const toggleInterlinear = useAppStore((s) => s.toggleInterlinear)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen)
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen)
  const setNotebookOpen = useAppStore((s) => s.setNotebookOpen)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)

  const edition = useAppStore(readingEdition)
  const showChapter = useAppStore(s => s.activity !== 'bible' ||
    editionDisplay(s.displayDefaults, s.displayOverrides, edition).chapterNumbers)
  const fromEdition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const native = readerChapter(book, chapter, activeVerse, fromEdition, edition)
  const bookName = BOOK_BY_ID[native?.book ?? book]?.name ?? book

  return (
    <header className="h-12 shrink-0 border-b border-line bg-panel flex items-center gap-2 px-3">
      <div className="flex items-center gap-2 text-accent">
        <BookIcon className="w-5 h-5" />
        <span className="font-semibold text-sm tracking-tight text-ink whitespace-nowrap">
          Open Bible Study
        </span>
      </div>

      <div className="h-5 w-px bg-line mx-1.5" />

      <div className="font-serif text-[15px] text-ink px-1 whitespace-nowrap">
        {bookName}{showChapter && <> <span className="text-accent">{native?.chapter ?? chapter}</span></>}{(native ? edition : fromEdition) === 'LXX' && ' (LXX)'}
      </div>

      <div className="flex-1" />

      <button
        onClick={toggleStrongs}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm border transition-colors whitespace-nowrap ${
          strongsVisible
            ? 'bg-accent-soft border-accent text-accent'
            : 'border-line hover:bg-elevated text-muted'
        }`}
        title="Toggle Strong's numbers"
      >
        <HashIcon className="w-4 h-4" />
        Strong&rsquo;s
      </button>

      <div
        className={`flex items-stretch rounded-md border transition-colors whitespace-nowrap ${
          restoring ? 'bg-accent-soft border-accent text-accent' : 'border-line text-muted'
        }`}
      >
        <button
          onClick={toggleSourceWords}
          aria-pressed={restoring}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-l-md ${
            restoring ? '' : 'hover:bg-elevated'
          }`}
          title="Show verified source words in the reading text"
        >
          <span className="text-[13px] leading-none">⇄</span>
          Restore words
        </button>
        <button
          onClick={() => setSourceWordSettingsOpen(true)}
          className={`px-1.5 flex items-center border-l rounded-r-md ${
            restoring ? 'border-accent/40 hover:bg-accent/10' : 'border-line hover:bg-elevated'
          }`}
          title="Choose words to restore"
        >
          <PenIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        onClick={toggleInterlinear}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm border transition-colors whitespace-nowrap ${
          interlinear
            ? 'bg-accent-soft border-accent text-accent'
            : 'border-line hover:bg-elevated text-muted'
        }`}
        title="Interlinear (word-by-word original language)"
      >
        <InterlinearIcon className="w-4 h-4" />
        Interlinear
      </button>

      <button
        onClick={() => setAssistantOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm border border-accent/40 text-accent hover:bg-accent-soft transition-colors whitespace-nowrap"
        title="Ask the AI study assistant"
      >
        <SparkleIcon className="w-4 h-4" />
        Assistant
      </button>

      <button
        onClick={() => setNotebookOpen(true)}
        className="p-2 rounded-md hover:bg-elevated text-muted"
        title="Notebook — free-form notes saved to a local folder"
      >
        <NotebookIcon className="w-4 h-4" />
      </button>

      <HistoryPanel />

      <button
        onClick={toggleTheme}
        className="p-2 rounded-md hover:bg-elevated text-muted"
        title="Toggle light / dark"
      >
        {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
      </button>

      <button type="button" title="Settings" aria-label="Settings" aria-haspopup="dialog"
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-1.5 p-2 rounded-md hover:bg-elevated text-sm text-muted">
        <SettingsIcon className="w-4 h-4" /><span className="hidden xl:inline">Settings</span>
      </button>

      <button
        onClick={() => setAboutOpen(true)}
        className="p-2 rounded-md hover:bg-elevated text-muted"
        title="About & credits"
      >
        <InfoIcon className="w-4 h-4" />
      </button>
    </header>
  )
}
