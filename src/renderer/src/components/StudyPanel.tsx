import { useAppStore, type StudyTab } from '@/store/useAppStore'
import { HashIcon, PenIcon, SearchIcon, CompareIcon } from './icons'
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

export default function StudyPanel(): JSX.Element {
  const studyTab = useAppStore((s) => s.studyTab)
  const setStudyTab = useAppStore((s) => s.setStudyTab)
  const selectedStrongs = useAppStore((s) => s.selectedStrongs)

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="h-10 shrink-0 border-b border-line flex">
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
