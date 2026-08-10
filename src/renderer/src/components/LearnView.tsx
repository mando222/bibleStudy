import { useAppStore, type LearnModule, type LearnLanguage } from '@/store/useAppStore'
import LearnAlphabet from './LearnAlphabet'
import LearnFlashcards from './LearnFlashcards'
import LearnDrills from './LearnDrills'
import LearnGrammar from './LearnGrammar'

const MODULES: { id: LearnModule; label: string }[] = [
  { id: 'alphabet', label: 'Alphabet' },
  { id: 'flashcards', label: 'Vocabulary' },
  { id: 'drills', label: 'Drills' },
  { id: 'grammar', label: 'Grammar' }
]

/** Learn: interactive Biblical Greek & Hebrew — alphabet, vocabulary (SRS), drills, and grammar. */
export default function LearnView(): JSX.Element {
  const module = useAppStore((s) => s.learnModule)
  const setModule = useAppStore((s) => s.setLearnModule)
  const language = useAppStore((s) => s.learnLanguage)
  const setLanguage = useAppStore((s) => s.setLearnLanguage)

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="shrink-0 border-b border-line bg-panel px-4 py-2 flex items-center gap-3">
        <h2 className="font-serif text-lg text-ink">Learn</h2>
        <div className="flex gap-0.5 rounded-md border border-line p-0.5">
          {(['greek', 'hebrew'] as LearnLanguage[]).map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={`px-2.5 py-0.5 rounded text-xs capitalize ${
                language === l ? 'bg-accent text-white' : 'text-muted hover:bg-elevated'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex gap-1">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => setModule(m.id)}
              className={`px-2.5 py-1 rounded-md text-sm border ${
                module === m.id
                  ? 'bg-accent-soft border-accent text-accent'
                  : 'border-line text-muted hover:bg-elevated'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {module === 'alphabet' && <LearnAlphabet language={language} />}
        {module === 'flashcards' && <LearnFlashcards language={language} />}
        {module === 'drills' && <LearnDrills language={language} />}
        {module === 'grammar' && <LearnGrammar language={language} />}
      </div>
    </div>
  )
}
