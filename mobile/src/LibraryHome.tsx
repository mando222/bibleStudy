import { GenealogyIcon, LearnIcon, MapPinIcon, NotebookIcon, PenIcon, TimelineIcon } from '@/components/icons'
import { Tool } from './PhoneTools'

type LibraryPage = 'maps' | 'genealogies' | 'timelines' | 'learn' | 'notebook'
type Props = {
  onNavigate: (page: LibraryPage) => void
  onAnnotations: () => void
}

export function LibraryHome({ onNavigate, onAnnotations }: Props) {
  return <div className="library-list">
    <p className="library-description">Explore Scripture and browse your saved study.</p>
    <h2 className="section-label">Explore Scripture</h2>
    <Tool icon={MapPinIcon} label="Atlas" detail="Places, regions, and documented journeys" onClick={() => onNavigate('maps')} />
    <Tool icon={GenealogyIcon} label="People" detail="Families, ancestry, and references" onClick={() => onNavigate('genealogies')} />
    <Tool icon={TimelineIcon} label="Timeline" detail="Events across biblical history" onClick={() => onNavigate('timelines')} />
    <Tool icon={LearnIcon} label="Languages" detail="Greek and Hebrew lessons and vocabulary drills" onClick={() => onNavigate('learn')} />
    <h2 className="section-label">My study</h2>
    <Tool icon={NotebookIcon} label="Notebook" detail="Longer notes and study documents" onClick={() => onNavigate('notebook')} />
    <Tool icon={PenIcon} label="All notes & highlights" detail="Saved annotations across the Bible" onClick={onAnnotations} />
  </div>
}
