import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAppStore } from '@/store/useAppStore'
import TopBar from '@/components/TopBar'
import NavPanel from '@/components/NavPanel'
import ReadingPanel from '@/components/ReadingPanel'
import StudyPanel from '@/components/StudyPanel'
import AboutModal from '@/components/AboutModal'
import QuickReplaceModal from '@/components/QuickReplaceModal'
import ChatDrawer from '@/components/ChatDrawer'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTranslations = useAppStore((s) => s.setTranslations)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Load the available translations once, and repair any stale/invalid selection.
  useEffect(() => {
    window.api
      .listTranslations()
      .then((list) => {
        setTranslations(list)
        const st = useAppStore.getState()
        if (list.length && !list.some((t) => t.id === st.primary)) {
          st.setParallels([list[0].id])
        }
      })
      .catch(() => undefined)
  }, [setTranslations])

  return (
    <div className="h-full flex flex-col bg-bg text-ink">
      <TopBar />
      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
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
      <AboutModal />
      <QuickReplaceModal />
      <ChatDrawer />
    </div>
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
