import { useEffect, useState } from 'react'
import type { VocabItem, SrsStats } from '@shared/types'
import type { LearnLanguage } from '@/store/useAppStore'

// SM-2 grade buttons.
const GRADES: { label: string; grade: number; cls: string }[] = [
  { label: 'Again', grade: 0, cls: 'bg-red-500/80' },
  { label: 'Hard', grade: 3, cls: 'bg-amber-500/80' },
  { label: 'Good', grade: 4, cls: 'bg-accent' },
  { label: 'Easy', grade: 5, cls: 'bg-emerald-500/80' }
]

/** Vocabulary flashcards with spaced repetition, built on the tagged original-language text. */
export default function LearnFlashcards({ language }: { language: LearnLanguage }): JSX.Element {
  const [queue, setQueue] = useState<VocabItem[]>([])
  const [i, setI] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState<SrsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    const [deck, due, s] = await Promise.all([
      window.api.getVocab(language, 200),
      window.api.listDueCards(language, 100),
      window.api.srsStats(language)
    ])
    const byStrongs = new Map(deck.map((v) => [v.strongs, v]))
    const dueSet = new Set(due.map((d) => d.strongs))
    const dueVocab = due.map((d) => byStrongs.get(d.strongs)).filter((v): v is VocabItem => !!v)
    const fresh = deck.filter((v) => !dueSet.has(v.strongs))
    setQueue([...dueVocab, ...fresh])
    setStats(s)
    setI(0)
    setRevealed(false)
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const card = queue[i]

  const grade = async (g: number): Promise<void> => {
    if (!card) return
    await window.api.reviewCard(card.strongs, language, g)
    window.api.srsStats(language).then(setStats).catch(() => undefined)
    setRevealed(false)
    setI((n) => n + 1)
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Loading…</div>

  if (!queue.length) {
    return (
      <div className="p-10 text-center text-muted">
        <p className="text-sm max-w-sm mx-auto leading-relaxed">
          No vocabulary yet. The word list is built from the tagged Greek/Hebrew text by
          <code className="mx-1 text-ink">npm run db:build</code>.
        </p>
      </div>
    )
  }

  if (i >= queue.length) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg text-ink">Session complete 🎉</p>
        <button
          onClick={() => {
            setI(0)
            setRevealed(false)
          }}
          className="mt-4 px-4 py-2 rounded-md bg-accent text-white text-sm hover:opacity-90"
        >
          Study again
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      {stats && (
        <div className="flex justify-center gap-4 text-xs text-muted mb-4">
          <span>learned {stats.learned}</span>
          <span>due {stats.due}</span>
          <span>
            card {i + 1}/{queue.length}
          </span>
        </div>
      )}
      <div className="rounded-xl border border-line bg-panel p-10 text-center">
        <div className="text-5xl text-ink font-serif" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
          {card.lemma}
        </div>
        {revealed ? (
          <div className="mt-5">
            {card.translit && <div className="text-sm text-muted">{card.translit}</div>}
            <div className="text-xl text-accent mt-1">{card.gloss ?? '—'}</div>
            <div className="text-[11px] text-faint mt-2">
              {card.strongs} · occurs {card.frequency}×
            </div>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="mt-6 px-4 py-1.5 rounded-md border border-line text-sm text-muted hover:bg-elevated"
          >
            Reveal
          </button>
        )}
      </div>
      {revealed && (
        <div className="grid grid-cols-4 gap-2 mt-4">
          {GRADES.map((g) => (
            <button
              key={g.grade}
              onClick={() => grade(g.grade)}
              className={`py-2 rounded-md text-white text-sm hover:opacity-90 ${g.cls}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
