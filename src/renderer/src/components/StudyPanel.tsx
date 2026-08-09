import { useAppStore, type StudyTab } from '@/store/useAppStore'
import { HashIcon, PenIcon, SearchIcon, CompareIcon, ChevronRight } from './icons'
import LexiconCard from './LexiconCard'
import NotesPanel from './NotesPanel'
import SearchPanel from './SearchPanel'
import ApparatusPanel from './ApparatusPanel'

const TABS: { id: StudyTab; label: string; Icon: typeof HashIcon }[] = [
  { id: 'lexicon', label: 'Lexicon', Icon: HashIcon },
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

export default function StudyPanel(): JSX.Element {
  const studyTab = useAppStore((s) => s.studyTab)
  const setStudyTab = useAppStore((s) => s.setStudyTab)
  const selectedStrongs = useAppStore((s) => s.selectedStrongs)
  const strongsBack = useAppStore((s) => s.strongsBack)
  const strongsForward = useAppStore((s) => s.strongsForward)
  const navBack = useAppStore((s) => s.strongsNavBack)
  const navForward = useAppStore((s) => s.strongsNavForward)

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="h-10 shrink-0 border-b border-line flex items-center">
        <div className="flex items-center h-full px-1 gap-0.5 border-r border-line">
          <NavBtn onClick={navBack} disabled={!strongsBack.length} title="Back" flip />
          <NavBtn onClick={navForward} disabled={!strongsForward.length} title="Forward" />
        </div>
        <div className="flex-1 flex h-full">
          {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setStudyTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              studyTab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
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
            {studyTab === 'notes' && <NotesPanel />}
            {studyTab === 'apparatus' && <ApparatusPanel />}
          </div>
        )}
      </div>
    </div>
  )
}
