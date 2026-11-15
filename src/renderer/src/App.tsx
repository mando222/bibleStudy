import { useEffect, useRef, useState } from 'react'
import type { UpdateInfo } from '@shared/types'
import { readerChapter } from '@/lib/passage'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAppStore, type Activity } from '@/store/useAppStore'
import { useEditions } from '@/hooks/useInterlinear'
import TopBar from '@/components/TopBar'
import UpdateBanner from '@/components/UpdateBanner'
import NavPanel from '@/components/NavPanel'
import ReadingPanel from '@/components/ReadingPanel'
import StudyPanel from '@/components/StudyPanel'
import AboutModal, { LibrarySettings } from '@/components/AboutModal'
import SourceWordSettings from '@/components/SourceWordSettings'
import SettingsDialog from '@/components/SettingsDialog'
import ChatDrawer from '@/components/ChatDrawer'
import NotebookDrawer from '@/components/NotebookDrawer'
import RetainedView from '@/components/RetainedView'
import ActivityRail from '@/components/ActivityRail'
import WordsView from '@/components/WordsView'
import GenealogiesView from '@/components/GenealogiesView'
import TimelinesView from '@/components/TimelinesView'
import MapsView from '@/components/MapsView'
import LearnView from '@/components/LearnView'

const activityNames: Record<Activity, string> = { bible: 'Bible', words: 'Words', timelines: 'Timeline', genealogies: 'People', maps: 'Atlas', learn: 'Languages' }

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTranslations = useAppStore((s) => s.setTranslations)
  const activity = useAppStore((s) => s.activity)
  const profileOrigin = useAppStore(s => s.profileOrigin)
  const [verseOrigin, setVerseOrigin] = useState<Activity | null>(null)
  useEffect(() => useAppStore.subscribe((s, prev) => {
    if (s.activity !== prev.activity) {
      setVerseOrigin(s.activity === 'bible' && s.readerVisit !== prev.readerVisit && prev.activity !== 'bible' ? prev.activity : null)
    }
  }), [])
  const returnTo = (activity === 'genealogies' ? profileOrigin : null) || verseOrigin
  const interlinearOpen = useAppStore(s => s.activity === 'bible' && s.interlinear)
  // Searches and word maps also need the installed editions before the first interlinear visit.
  useEditions(!interlinearOpen)
  const book = useAppStore((s) => s.book)
  const chapter = useAppStore((s) => s.chapter)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const checkedManually = useRef(false)
  const banner = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      if (checkedManually.current) return
      try {
        const release = await window.updates?.check()
        if (active && !checkedManually.current && release) setUpdate(release)
      } catch { /* Background checks stay quiet when offline. */ }
    }, 3000)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  const onManualCheck = (release: UpdateInfo | null): void => {
    // A slower launch check must not supersede the release the reader just checked.
    checkedManually.current = true
    setUpdateDismissed(false)
    setUpdate(release)
  }

  return (
    <div className="h-full flex flex-col bg-bg text-ink">
      <TopBar />
      {update && (
        <UpdateBanner
          key={update.latest}
          info={update}
          bannerRef={banner}
          dismissed={updateDismissed}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
      <div className="flex-1 min-h-0 flex">
        <ActivityRail />
        <div className="flex-1 min-w-0 flex flex-col">
          {returnTo && <button className="self-start px-3 py-1 text-xs text-accent" onClick={() => useAppStore.getState().setActivity(returnTo)}>‹ Back to {activityNames[returnTo]}</button>}
          <div className="min-h-0 flex-1">
            <RetainedView active={activity === 'bible'}><BibleWorkspace /></RetainedView>
            <RetainedView active={activity === 'words'}><WordsView /></RetainedView>
            <RetainedView active={activity === 'genealogies'}><GenealogiesView /></RetainedView>
            <RetainedView active={activity === 'timelines'}><TimelinesView /></RetainedView>
            <RetainedView active={activity === 'maps'}><MapsView /></RetainedView>
            <RetainedView active={activity === 'learn'}><LearnView /></RetainedView>
          </div>
        </div>
      </div>
      <AboutModal
        update={updateDismissed ? null : update}
        onChecked={onManualCheck}
        onViewUpdate={() => banner.current?.focus()}
      />
      <SourceWordSettings />
      <SettingsDialog>
        <LibrarySettings update={updateDismissed ? null : update} onChecked={onManualCheck} onViewUpdate={() => {
          useAppStore.getState().setSettingsOpen(false)
          queueMicrotask(() => banner.current?.focus())
        }} />
      </SettingsDialog>
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
