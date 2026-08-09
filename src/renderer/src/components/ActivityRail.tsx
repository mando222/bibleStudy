import { useAppStore, type Activity } from '@/store/useAppStore'
import { BookIcon, GenealogyIcon, TimelineIcon, MapPinIcon, WordsIcon } from './icons'

const TABS: { id: Activity; label: string; title: string; Icon: typeof BookIcon }[] = [
  { id: 'bible', label: 'Bible', title: 'Bible', Icon: BookIcon },
  { id: 'genealogies', label: 'Family', title: 'Genealogies', Icon: GenealogyIcon },
  { id: 'timelines', label: 'Timeline', title: 'Timelines', Icon: TimelineIcon },
  { id: 'maps', label: 'Maps', title: 'Maps', Icon: MapPinIcon },
  { id: 'words', label: 'Words', title: 'Word study', Icon: WordsIcon }
]

/** Far-right vertical rail that switches the whole workspace between activities. */
export default function ActivityRail(): JSX.Element {
  const activity = useAppStore((s) => s.activity)
  const setActivity = useAppStore((s) => s.setActivity)

  return (
    <div className="w-14 shrink-0 border-l border-line bg-panel flex flex-col items-center py-2 gap-1">
      {TABS.map(({ id, label, title, Icon }) => {
        const active = activity === id
        return (
          <button
            key={id}
            onClick={() => setActivity(id)}
            title={title}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors ${
              active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated hover:text-ink'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
