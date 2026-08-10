import { useEffect, useState } from 'react'
import type { VocabItem } from '@shared/types'
import type { LearnLanguage } from '@/store/useAppStore'

interface Question {
  target: VocabItem
  options: string[]
  answer: string
}

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Recognition drill: see the original word, pick its meaning from four choices. */
export default function LearnDrills({ language }: { language: LearnLanguage }): JSX.Element {
  const [deck, setDeck] = useState<VocabItem[]>([])
  const [q, setQ] = useState<Question | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })

  const makeQuestion = (pool: VocabItem[]): Question | null => {
    const withGloss = pool.filter((v) => v.gloss)
    if (withGloss.length < 4) return null
    const target = withGloss[Math.floor(Math.random() * withGloss.length)]
    const distractors = shuffle(withGloss.filter((v) => v.strongs !== target.strongs))
      .slice(0, 3)
      .map((v) => v.gloss as string)
    return {
      target,
      options: shuffle([target.gloss as string, ...distractors]),
      answer: target.gloss as string
    }
  }

  useEffect(() => {
    window.api
      .getVocab(language, 120)
      .then((d) => {
        setDeck(d)
        setQ(makeQuestion(d))
        setPicked(null)
        setScore({ right: 0, total: 0 })
      })
      .catch(() => setDeck([]))
  }, [language])

  const pick = (opt: string): void => {
    if (picked) return
    setPicked(opt)
    setScore((s) => ({ right: s.right + (opt === q?.answer ? 1 : 0), total: s.total + 1 }))
  }
  const next = (): void => {
    setQ(makeQuestion(deck))
    setPicked(null)
  }

  if (!q) {
    return (
      <div className="p-10 text-center text-muted">
        <p className="text-sm max-w-sm mx-auto leading-relaxed">
          Drills need the vocabulary list, built from the tagged text by
          <code className="mx-1 text-ink">npm run db:build</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-6 text-center">
      <div className="text-xs text-muted mb-4">
        score {score.right}/{score.total}
      </div>
      <div className="rounded-xl border border-line bg-panel p-8">
        <div className="text-4xl text-ink font-serif" dir={language === 'hebrew' ? 'rtl' : 'ltr'}>
          {q.target.lemma}
        </div>
        {q.target.translit && <div className="text-xs text-faint mt-1">{q.target.translit}</div>}
      </div>
      <div className="grid grid-cols-1 gap-2 mt-4">
        {q.options.map((opt) => {
          const isAnswer = opt === q.answer
          const state = !picked
            ? 'border-line hover:bg-elevated text-ink'
            : isAnswer
              ? 'border-emerald-500 bg-emerald-500/10 text-ink'
              : opt === picked
                ? 'border-red-500 bg-red-500/10 text-ink'
                : 'border-line text-muted'
          return (
            <button
              key={opt}
              onClick={() => pick(opt)}
              disabled={!!picked}
              className={`py-2 px-3 rounded-md border text-sm text-left ${state}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {picked && (
        <button
          onClick={next}
          className="mt-4 px-5 py-2 rounded-md bg-accent text-white text-sm hover:opacity-90"
        >
          Next
        </button>
      )}
    </div>
  )
}
