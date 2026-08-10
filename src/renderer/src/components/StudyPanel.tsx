import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useAppStore, type StudyTab } from '@/store/useAppStore'
import { HashIcon, PenIcon, SearchIcon, CompareIcon, LinkIcon, ChevronRight } from './icons'
import LexiconCard from './LexiconCard'
import NotesPanel from './NotesPanel'
import SearchPanel from './SearchPanel'
import ApparatusPanel from './ApparatusPanel'
import CrossRefsPanel from './CrossRefsPanel'

const TABS: { id: StudyTab; label: string; Icon: typeof HashIcon }[] = [
  { id: 'lexicon', label: 'Lexicon', Icon: HashIcon },
  { id: 'crossrefs', label: 'Cross-refs', Icon: LinkIcon },
  { id: 'notes', label: 'Notes', Icon: PenIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'apparatus', label: 'Variants', Icon: CompareIcon }
]

/** Back/forward through the study-pane word history. */
function NavBtn({
  onClick,
  disabled,
  title,
  flip
}: {
  onClick: () => void
  disabled: boolean
  title: string
  flip?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md ${
        disabled ? 'text-faint/40' : 'text-muted hover:text-accent hover:bg-elevated'
      }`}
    >
      <ChevronRight className={`w-4 h-4 ${flip ? 'rotate-180' : ''}`} />
    </button>
  )
}

/**
 * Which tab labels fit. Each tab gets an equal share of the bar; a tab shows its text only if the
 * icon + label fit that share, otherwise it collapses to an icon (with a tooltip). Re-measures on
 * resize, since the study panel is user-resizable. Returns the set of tab ids that keep their label.
 */
function useFittingTabLabels(
  barRef: RefObject<HTMLElement>,
  tabs: { id: StudyTab; label: string }[]
): Set<StudyTab> {
  const [fit, setFit] = useState<Set<StudyTab>>(() => new Set(tabs.map((t) => t.id)))
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const ctx = document.createElement('canvas').getContext('2d')
    const measure = (): void => {
      const slot = el.clientWidth / tabs.length
      const family = getComputedStyle(el).fontFamily || 'sans-serif'
      if (ctx) ctx.font = `500 12px ${family}` // text-xs, font-medium
      const next = new Set<StudyTab>()
      for (const t of tabs) {
        const textW = ctx ? ctx.measureText(t.label).width : t.label.length * 6.5
        // icon (14) + gap (6) + breathing room (12) + the label.
        if (32 + textW <= slot) next.add(t.id)
      }
      setFit((prev) =>
        prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [barRef, tabs])
  return fit
}

export default function StudyPanel(): JSX.Element {
  const studyTab = useAppStore((s) => s.studyTab)
  const setStudyTab = useAppStore((s) => s.setStudyTab)
  const selectedStrongs = useAppStore((s) => s.selectedStrongs)
  const strongsBack = useAppStore((s) => s.strongsBack)
  const strongsForward = useAppStore((s) => s.strongsForward)
  const navBack = useAppStore((s) => s.strongsNavBack)
  const navForward = useAppStore((s) => s.strongsNavForward)
  const barRef = useRef<HTMLDivElement>(null)
  const fit = useFittingTabLabels(barRef, TABS)

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="h-10 shrink-0 border-b border-line flex items-center">
        <div className="flex items-center h-full px-1 gap-0.5 border-r border-line">
          <NavBtn onClick={navBack} disabled={!strongsBack.length} title="Back" flip />
          <NavBtn onClick={navForward} disabled={!strongsForward.length} title="Forward" />
        </div>
        <div ref={barRef} className="flex-1 flex h-full">
          {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setStudyTab(id)}
            title={label}
            className={`flex-1 flex items-center justify-center gap-1.5 px-1 text-xs font-medium border-b-2 -mb-px whitespace-nowrap overflow-hidden transition-colors ${
              studyTab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {fit.has(id) && <span>{label}</span>}
          </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {studyTab === 'search' ? (
          <SearchPanel />
        ) : (
          <div className="h-full overflow-y-auto p-4 text-sm text-muted leading-relaxed">
            {studyTab === 'lexicon' && <LexiconCard id={selectedStrongs} />}
            {studyTab === 'crossrefs' && <CrossRefsPanel />}
            {studyTab === 'notes' && <NotesPanel />}
            {studyTab === 'apparatus' && <ApparatusPanel />}
          </div>
        )}
      </div>
    </div>
  )
}
