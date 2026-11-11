import { useEffect } from 'react'
import { readerChapter } from '@/lib/passage'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAppStore } from '@/store/useAppStore'
import TopBar from '@/components/TopBar'
import UpdateBanner from '@/components/UpdateBanner'
import NavPanel from '@/components/NavPanel'
import ReadingPanel from '@/components/ReadingPanel'
import StudyPanel from '@/components/StudyPanel'
import AboutModal from '@/components/AboutModal'
import SourceWordSettings from '@/components/SourceWordSettings'
import ChatDrawer from '@/components/ChatDrawer'
import NotebookDrawer from '@/components/NotebookDrawer'
import ActivityRail from '@/components/ActivityRail'
import WordsView from '@/components/WordsView'
import GenealogiesView from '@/components/GenealogiesView'
import TimelinesView from '@/components/TimelinesView'
import MapsView from '@/components/MapsView'
import LearnView from '@/components/LearnView'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTranslations = useAppStore((s) => s.setTranslations)
  const activity = useAppStore((s) => s.activity)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)

  const edition = useAppStore((s) => s.referenceEdition || s.primary)
  const activeVerse = useAppStore((s) => s.activeVerse)
  const canonical = readerChapter(book, chapter, activeVerse, edition, 'KJV')
  const historyBook = canonical?.book
  const historyChapter = canonical?.chapter

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Record each chapter the reader visits, for the History & bookmarks menu.
  useEffect(() => {
    if (historyBook && historyChapter) window.api?.addHistory(historyBook, historyChapter).catch(() => undefined)
  }, [historyBook, historyChapter])

  useEffect(() => {
    window.api.listTranslations().then(setTranslations).catch(() => undefined)
  }, [setTranslations])

  return (
    <div className="h-full flex flex-col bg-bg text-ink">
      <TopBar />
      <UpdateBanner />
      <div className="flex-1 min-h-0 flex">
        <ActivityRail />
        <div className="flex-1 min-w-0">
          {activity === 'bible' && <BibleWorkspace />}
          {activity === 'words' && <WordsView />}
          {activity === 'genealogies' && <GenealogiesView />}
          {activity === 'timelines' && <TimelinesView />}
          {activity === 'maps' && <MapsView />}
          {activity === 'learn' && <LearnView />}
        </div>
      </div>
      <AboutModal />
      <SourceWordSettings />
      <ChatDrawer />
      <NotebookDrawer />
    </div>
  )
}

/** The Bible reader workspace: navigation · reading · study, resizable. */
function BibleWorkspace(): JSX.Element {
  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={19} minSize={13} maxSize={32} className="min-w-0">
        <NavPanel />
      </Panel>
      <ResizeHandle />
      <Panel defaultSize={55} minSize={30} className="min-w-0">
        <ReadingPanel />
      </Panel>
      <ResizeHandle />
      <Panel defaultSize={26} minSize={16} className="min-w-0">
        <StudyPanel />
      </Panel>
    </PanelGroup>
  )
}

function ResizeHandle(): JSX.Element {
  return (
    <PanelResizeHandle className="group relative w-px bg-line data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent transition-colors">
      {/* Widen the hit area without shifting layout */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </PanelResizeHandle>
  )
}
